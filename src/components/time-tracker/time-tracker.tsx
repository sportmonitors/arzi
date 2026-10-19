'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import type {User} from 'firebase/auth';
import {format} from 'date-fns';
import {
  ArrowRight,
  Clock,
  Pencil,
  PlusCircle,
  Square,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';

import {ADMIN_UID} from '@/lib/admin';
import {
  createTimeEntryApi,
  deleteTimeEntryApi,
  getActiveTimerApi,
  getAllTimeEntries,
  getProjects,
  startTimerApi,
  stopTimerApi,
  updateTimeEntryApi,
} from '@/lib/time-api';
import type {ActiveTimer, Project, TimeEntry} from '@/types/time-tracking';
import {useToast} from '@/hooks/use-toast';
import {cn} from '@/lib/utils';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {Textarea} from '@/components/ui/textarea';

const DEFAULT_RATE = 8.12;
const NONE_PROJECT = '__none__';

const formatElapsed = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const formatDateTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const formatUSD = (amount: number) =>
  new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(
    amount
  );

const formatHours = (seconds: number) =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(
    seconds / 3600
  );

type ManualForm = {
  description: string;
  projectId: string;
  rate: number;
  start: string;
  end: string;
};

const emptyManualForm = (): ManualForm => {
  const now = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  return {
    description: '',
    projectId: NONE_PROJECT,
    rate: DEFAULT_RATE,
    start: now,
    end: now,
  };
};

export default function TimeTracker({user}: {user: User}) {
  const isAdmin = user.uid === ADMIN_UID;
  const {toast} = useToast();

  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>(NONE_PROJECT);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [manualForm, setManualForm] = useState<ManualForm>(emptyManualForm);

  const refresh = useCallback(async () => {
    const [projectsData, entriesData, timer] = await Promise.all([
      getProjects(),
      getAllTimeEntries(),
      getActiveTimerApi(),
    ]);
    setProjects(projectsData);
    setEntries(entriesData);
    setActive(timer);
    if (timer) {
      setDescription(timer.description);
      setProjectId(timer.projectId || NONE_PROJECT);
      setRate(timer.rate);
    }
  }, []);

  useEffect(() => {
    refresh()
      .catch((error) => {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'خطا',
          description: 'بارگذاری کارکرد از D1 ناموفق بود.',
        });
      })
      .finally(() => setLoading(false));
  }, [refresh, toast]);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(
        Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000)
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const totalHours = useMemo(
    () => entries.reduce((sum, e) => sum + e.durationSeconds / 3600, 0),
    [entries]
  );

  const handleStart = async () => {
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      const timer = await startTimerApi(user.uid, {
        description: description.trim(),
        projectId: projectId === NONE_PROJECT ? null : projectId,
        rate,
      });
      setActive(timer);
      toast({title: 'تایمر شروع شد'});
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'خطا در استارت',
        description: error instanceof Error ? error.message : 'ناموفق',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!isAdmin || busy || !active) return;
    setBusy(true);
    try {
      await stopTimerApi(user.uid, {description: description.trim()});
      setActive(null);
      setDescription('');
      await refresh();
      toast({title: 'تایمر متوقف و ذخیره شد'});
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'خطا در استاپ',
        description: error instanceof Error ? error.message : 'ناموفق',
      });
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setManualForm(emptyManualForm());
    setDialogOpen(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditing(entry);
    setManualForm({
      description: entry.description,
      projectId: entry.projectId || NONE_PROJECT,
      rate: entry.rate,
      start: format(new Date(entry.startAt), "yyyy-MM-dd'T'HH:mm"),
      end: format(
        new Date(entry.endAt || entry.startAt),
        "yyyy-MM-dd'T'HH:mm"
      ),
    });
    setDialogOpen(true);
  };

  const handleSaveManual = async () => {
    if (!isAdmin || busy) return;
    if (!manualForm.description.trim()) {
      toast({variant: 'destructive', title: 'شرح الزامی است'});
      return;
    }
    setBusy(true);
    try {
      const payload = {
        description: manualForm.description.trim(),
        startAt: new Date(manualForm.start).toISOString(),
        endAt: new Date(manualForm.end).toISOString(),
        rate: manualForm.rate,
        projectId:
          manualForm.projectId === NONE_PROJECT ? null : manualForm.projectId,
      };
      if (editing) {
        await updateTimeEntryApi(user.uid, editing.id, payload);
        toast({title: 'رکورد ویرایش شد'});
      } else {
        await createTimeEntryApi(user.uid, payload);
        toast({title: 'رکورد اضافه شد'});
      }
      setDialogOpen(false);
      await refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'خطا در ذخیره',
        description: error instanceof Error ? error.message : 'ناموفق',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || busy) return;
    if (!window.confirm('این رکورد حذف شود؟')) return;
    setBusy(true);
    try {
      await deleteTimeEntryApi(user.uid, id);
      await refresh();
      toast({title: 'حذف شد'});
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'خطا در حذف',
        description: error instanceof Error ? error.message : 'ناموفق',
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">در حال بارگذاری تایمر...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" dir="rtl">
        <p>فقط ادمین به تایمر دسترسی دارد.</p>
        <Button asChild variant="outline">
          <Link href="/">بازگشت</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen" dir="rtl">
      <div className="container mx-auto space-y-6 p-4 md:p-8">
        <header className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/15 p-2.5 text-primary ring-1 ring-primary/20">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">تایمر کارکرد</h1>
              <p className="text-sm text-muted-foreground">
                استارت / استاپ شبیه Clockify · {entries.length} رکورد ·{' '}
                {formatHours(totalHours * 3600)} ساعت
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/">
              ماشین‌حساب
              <ArrowRight className="mr-2 h-4 w-4" />
            </Link>
          </Button>
        </header>

        <Card className={cn(active && 'ring-2 ring-emerald-500/40')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">تایمر زنده</CardTitle>
            <CardDescription>
              توضیح بنویسید، پروژه را انتخاب کنید و استارت بزنید.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_120px_auto] md:items-end">
              <div className="space-y-2">
                <Label>توضیحات</Label>
                <Input
                  placeholder="مثلاً: رفع باگ لاگین"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <Label>پروژه</Label>
                <Select
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={busy || Boolean(active)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون پروژه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_PROJECT}>بدون پروژه</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.clientName ? ` · ${p.clientName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نرخ ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value) || DEFAULT_RATE)}
                  disabled={busy || Boolean(active)}
                />
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'min-w-[110px] rounded-lg border bg-muted/40 px-3 py-2 text-center font-mono text-xl tabular-nums',
                    active && 'text-emerald-400'
                  )}
                >
                  {formatElapsed(elapsed)}
                </div>
                {active ? (
                  <Button
                    variant="destructive"
                    onClick={handleStop}
                    disabled={busy}
                    className="gap-2"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    onClick={handleStart}
                    disabled={busy}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Clock className="h-4 w-4" />
                    Start
                  </Button>
                )}
              </div>
            </div>
            {active && (
              <Badge variant="secondary" className="font-tabular">
                شروع: {formatDateTime(active.startedAt)}
                {active.projectName ? ` · ${active.projectName}` : ''}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>سوابق کارکرد</CardTitle>
                <CardDescription>
                  ویرایش، حذف، یا افزودن دستی ساعت کار
                </CardDescription>
              </div>
              <Button variant="outline" onClick={openCreate} disabled={busy}>
                <PlusCircle className="ml-2 h-4 w-4" />
                افزودن دستی
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[560px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شرح</TableHead>
                    <TableHead>پروژه</TableHead>
                    <TableHead>منبع</TableHead>
                    <TableHead>شروع</TableHead>
                    <TableHead>پایان</TableHead>
                    <TableHead className="text-left">ساعات</TableHead>
                    <TableHead className="text-left">جمع</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center">
                        هنوز رکوردی نیست. ایمپورت Clockify را اجرا کنید یا تایمر
                        را استارت بزنید.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          {entry.description || 'بدون شرح'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {entry.projectName || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.source}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-tabular text-xs">
                          {formatDateTime(entry.startAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-tabular text-xs">
                          {entry.endAt ? formatDateTime(entry.endAt) : '—'}
                        </TableCell>
                        <TableCell className="text-left font-tabular">
                          {formatHours(entry.durationSeconds)}
                        </TableCell>
                        <TableCell className="text-left font-tabular">
                          {formatUSD(
                            (entry.durationSeconds / 3600) * entry.rate
                          )}
                        </TableCell>
                        <TableCell className="space-x-1 text-left">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(entry)}
                            disabled={busy}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(entry.id)}
                            disabled={busy}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'ویرایش رکورد' : 'افزودن رکورد دستی'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>شرح</Label>
              <Textarea
                value={manualForm.description}
                onChange={(e) =>
                  setManualForm((f) => ({...f, description: e.target.value}))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>پروژه</Label>
                <Select
                  value={manualForm.projectId}
                  onValueChange={(v) =>
                    setManualForm((f) => ({...f, projectId: v}))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_PROJECT}>بدون پروژه</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نرخ ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualForm.rate}
                  onChange={(e) =>
                    setManualForm((f) => ({
                      ...f,
                      rate: Number(e.target.value) || DEFAULT_RATE,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>شروع</Label>
                <Input
                  type="datetime-local"
                  value={manualForm.start}
                  onChange={(e) =>
                    setManualForm((f) => ({...f, start: e.target.value}))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>پایان</Label>
                <Input
                  type="datetime-local"
                  value={manualForm.end}
                  onChange={(e) =>
                    setManualForm((f) => ({...f, end: e.target.value}))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  انصراف
                </Button>
              </DialogClose>
              <Button onClick={handleSaveManual} disabled={busy}>
                ذخیره
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
