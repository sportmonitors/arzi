'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, Calculator, Download, Edit, FileCode2, FileSpreadsheet, PlusCircle, Printer, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { User } from 'firebase/auth';

import { ADMIN_UID } from '@/lib/admin';
import { getSummary } from '@/lib/actions';
import {
  addPayment,
  deletePayment,
  getPayments,
  updatePayment,
  getWorkLogs,
  addWorkLog,
  updateWorkLog,
  deleteWorkLog,
} from '@/lib/db';
import { downloadExcelReport, downloadHtmlReport } from '@/lib/export-report';
import type { Payment, WorkLog } from '@/types';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';
import { Textarea } from './ui/textarea';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';

const paymentSchema = z.object({
  amountIRT: z.coerce.number().positive('مبلغ باید عدد مثبت باشد.'),
  exchangeRate: z.coerce
    .number()
    .positive('نرخ تبدیل باید عدد مثبت باشد.'),
  date: z.date({ required_error: 'تاریخ الزامی است.' }),
  description: z.string().optional(),
});

const workLogSchema = z.object({
  description: z.string().min(1, 'شرح الزامی است.'),
  hours: z.coerce.number().positive('ساعت باید عدد مثبت باشد.'),
  rate: z.coerce.number().positive('نرخ باید عدد مثبت باشد.'),
  start: z.string().optional(), // Making these optional for manual entry
  end: z.string().optional(),
});

interface ArzCalculatorProps {
  user: User;
}

// Interface for the data coming from the Clockify API
interface ClockifyTimeEntry {
  description: string;
  timeInterval: {
    start: string;
    end: string;
    duration: number; // in seconds
  };
  rate: number;
  amount: number; // This is the earned amount
  _id: string;
}

export default function ArzCalculator({ user }: ArzCalculatorProps) {
  const [manualWorkLogs, setManualWorkLogs] = useState<WorkLog[]>([]);
  const [clockifyWorkLogs, setClockifyWorkLogs] = useState<WorkLog[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [exchangeRate, setExchangeRate] = useState(0);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, startAiTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(true);

  const { toast } = useToast();

  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isPaymentDialogOpen, setPaymentDialogOpen] = useState(false);
  
  const [editingWorkLog, setEditingWorkLog] = useState<WorkLog | null>(null);
  const [isWorkLogDialogOpen, setWorkLogDialogOpen] = useState(false);

  const isAdmin = useMemo(() => user.uid === ADMIN_UID, [user.uid]);

  const paymentForm = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amountIRT: 0,
      exchangeRate: exchangeRate > 0 ? exchangeRate : 0,
      date: new Date(),
      description: '',
    },
  });

  const workLogForm = useForm<z.infer<typeof workLogSchema>>({
    resolver: zodResolver(workLogSchema),
    defaultValues: {
      description: '',
      hours: 0,
      rate: 8.12,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
    },
  });


  const handleSyncClockify = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/clockify-report');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const clockifyEntries: ClockifyTimeEntry[] = await response.json();
      
      const CORRECT_RATE = 8.12;

      const formattedWorkLogs: WorkLog[] = clockifyEntries.map(entry => ({
        id: `clockify-${entry._id}`,
        description: entry.description || 'بدون شرح',
        hours: (entry.timeInterval.duration || 0) / 3600,
        rate: CORRECT_RATE, // Correct the rate here
        start: entry.timeInterval.start,
        end: entry.timeInterval.end,
        isManual: false,
      })).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

      setClockifyWorkLogs(formattedWorkLogs);
      if (isDataLoaded) { // Avoid showing toast on initial load
        toast({
          title: 'همگام‌سازی موفق',
          description: `${formattedWorkLogs.length} رکورد کاری از Clockify بارگذاری شد.`
        });
      }

    } catch (error) {
      console.error("Failed to sync with Clockify:", error);
      toast({
        variant: 'destructive',
        title: 'خطا در همگام‌سازی',
        description: 'امکان دریافت اطلاعات از Clockify وجود ندارد.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        const [paymentsData, workLogsData] = await Promise.all([
          getPayments(ADMIN_UID),
          getWorkLogs(ADMIN_UID),
          handleSyncClockify() // Automatically sync with Clockify on initial load
        ]);
        setPayments(paymentsData);
        setManualWorkLogs(workLogsData.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()));
      } catch (error) {
        console.error(error);
        toast({
          variant: 'destructive',
          title: 'خطا در بارگذاری اطلاعات',
          description: 'خطا در بارگذاری اطلاعات از Firestore.',
        });
      } finally {
        setIsDataLoaded(true);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, toast]);


  useEffect(() => {
    if (exchangeRate > 0 && !paymentForm.getValues('exchangeRate')) {
      paymentForm.setValue('exchangeRate', exchangeRate);
    }
  }, [exchangeRate, paymentForm]);

  // Effect for Payment Dialog
  useEffect(() => {
    if (isPaymentDialogOpen) {
      if (editingPayment) {
        paymentForm.reset({
          ...editingPayment,
          date: new Date(editingPayment.date),
          exchangeRate: editingPayment.exchangeRate || (exchangeRate > 0 ? exchangeRate : 0),
        });
      } else {
        paymentForm.reset({
          amountIRT: 0,
          exchangeRate: exchangeRate > 0 ? exchangeRate : 0,
          date: new Date(),
          description: '',
        });
      }
    }
  }, [isPaymentDialogOpen, editingPayment, paymentForm, exchangeRate]);

  const closePaymentDialog = () => {
    setEditingPayment(null);
    setPaymentDialogOpen(false);
  };

  const handlePaymentSubmit = async (values: z.infer<typeof paymentSchema>) => {
    if (!isAdmin) return;
    const paymentData = {
      ...values,
      date: values.date.getTime(),
    };
    try {
      if (editingPayment) {
        const updatedPayment = { ...editingPayment, ...paymentData };
        await updatePayment(ADMIN_UID!, updatedPayment);
        setPayments(
          payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p))
        );
        toast({ title: 'موفق', description: 'پرداخت ویرایش شد.' });
      } else {
        const newPayment = await addPayment(ADMIN_UID!, paymentData);
        setPayments([...payments, newPayment]);
        toast({ title: 'موفق', description: 'پرداخت اضافه شد.' });
      }
      closePaymentDialog();
    } catch {
      toast({
        variant: 'destructive',
        title: 'خطا',
        description: `خطا در ${editingPayment ? 'ویرایش' : 'افزودن'} پرداخت.`,
      });
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deletePayment(ADMIN_UID!, id);
      setPayments(payments.filter((p) => p.id !== id));
      toast({ title: 'موفق', description: 'پرداخت حذف شد.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'خطا',
        description: 'خطا در حذف پرداخت.',
      });
    }
  };

  // Effect for WorkLog Dialog
  useEffect(() => {
    if (isWorkLogDialogOpen) {
        if (editingWorkLog) {
            workLogForm.reset({
                ...editingWorkLog,
                start: editingWorkLog.start ? format(new Date(editingWorkLog.start), "yyyy-MM-dd'T'HH:mm") : '',
                end: editingWorkLog.end ? format(new Date(editingWorkLog.end), "yyyy-MM-dd'T'HH:mm") : '',
            });
        } else {
            workLogForm.reset({
                description: '',
                hours: 0,
                rate: 8.12,
                start: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                end: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
            });
        }
    }
  }, [isWorkLogDialogOpen, editingWorkLog, workLogForm]);


  const closeWorkLogDialog = () => {
    setEditingWorkLog(null);
    setWorkLogDialogOpen(false);
  };

  const handleWorkLogSubmit = async (values: z.infer<typeof workLogSchema>) => {
    if (!isAdmin) return;
    const workLogData = {
      ...values,
      isManual: true,
      start: values.start || new Date().toISOString(),
      end: values.end || new Date().toISOString(),
    };

    try {
      if (editingWorkLog && editingWorkLog.id) {
        const updatedLog = { ...editingWorkLog, ...workLogData };
        await updateWorkLog(ADMIN_UID!, updatedLog);
        setManualWorkLogs(
          manualWorkLogs.map((l) => (l.id === updatedLog.id ? updatedLog : l)).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
        );
        toast({ title: 'موفق', description: 'رکورد کاری ویرایش شد.' });
      } else {
        const newLog = await addWorkLog(ADMIN_UID!, workLogData);
        setManualWorkLogs([...manualWorkLogs, newLog].sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()));
        toast({ title: 'موفق', description: 'رکورد کاری اضافه شد.' });
      }
      closeWorkLogDialog();
    } catch {
      toast({
        variant: 'destructive',
        title: 'خطا',
        description: `خطا در ${editingWorkLog ? 'ویرایش' : 'افزودن'} رکورد کاری.`,
      });
    }
  };

  const handleDeleteWorkLog = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteWorkLog(ADMIN_UID!, id);
      setManualWorkLogs(manualWorkLogs.filter((l) => l.id !== id));
      toast({ title: 'موفق', description: 'رکورد کاری حذف شد.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'خطا',
        description: 'خطا در حذف رکورد کاری.',
      });
    }
  };

  const combinedWorkLogs = useMemo(() => {
    return [...clockifyWorkLogs, ...manualWorkLogs];
  }, [clockifyWorkLogs, manualWorkLogs]);


  const {
    totalHours,
    totalEarningsUSD,
    totalPaymentsIRT,
    totalPaymentsUSD,
    balanceUSD,
    balanceIRT,
  } = useMemo(() => {
    const totalHours = combinedWorkLogs.reduce((sum, log) => sum + log.hours, 0);
    const totalEarningsUSD = combinedWorkLogs.reduce(
      (sum, log) => sum + log.hours * log.rate,
      0
    );
    const totalPaymentsIRT = payments.reduce(
      (sum, p) => sum + p.amountIRT,
      0
    );
    const totalPaymentsUSD = payments.reduce(
      (sum, p) => sum + p.amountIRT / p.exchangeRate,
      0
    );
    const balanceUSD = totalEarningsUSD - totalPaymentsUSD;
    const balanceIRT = exchangeRate > 0 ? balanceUSD * exchangeRate : 0;
    return {
      totalHours,
      totalEarningsUSD,
      totalPaymentsIRT,
      totalPaymentsUSD,
      balanceUSD,
      balanceIRT,
    };
  }, [combinedWorkLogs, payments, exchangeRate]);

  const handleGenerateSummary = () => {
    startAiTransition(async () => {
      const summary = await getSummary({
        totalHoursWorked: totalHours,
        totalEarningsUSD: totalEarningsUSD,
        totalPaymentsIRT: totalPaymentsIRT,
        totalPaymentsUSD: totalPaymentsUSD,
        remainingBalanceIRT: balanceIRT,
        remainingBalanceUSD: balanceUSD,
      });
      setAiSummary(summary.summary);
    });
  };

  const buildReport = () => ({
    generatedAt: new Date(),
    exchangeRate,
    totalHours,
    totalEarningsUSD,
    totalPaymentsIRT,
    totalPaymentsUSD,
    balanceUSD,
    balanceIRT,
    payments,
    manualWorkLogs,
    clockifyWorkLogs,
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    downloadExcelReport(buildReport());
    toast({ title: 'خروجی اکسل', description: 'فایل اکسل دانلود شد.' });
  };

  const handleExportHtml = () => {
    downloadHtmlReport(buildReport());
    toast({ title: 'خروجی HTML', description: 'فایل HTML دانلود شد.' });
  };

  const formatUSD = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  const formatIRT = (amount: number) =>
    new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';
  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    try {
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(dateString));
    } catch (e) {
        return 'تاریخ نامعتبر'
    }
  }

  if (!isDataLoaded) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <div className="rounded-2xl border bg-card/80 px-8 py-6 shadow-lg backdrop-blur">
          <p className="text-muted-foreground">در حال بارگذاری اطلاعات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="print-root container mx-auto space-y-8 p-4 md:p-8">
      <div className="print-title mb-2 hidden border-b border-slate-300 pb-3 text-center">
        <h1 className="text-2xl font-bold text-slate-900">فیش خلاصه حساب · محاسبه‌گر ارز</h1>
        <p className="mt-1 text-sm text-slate-600">
          تاریخ چاپ: {new Date().toLocaleDateString('fa-IR')}
          {exchangeRate > 0 ? ` · نرخ دلار: ${formatNumber(exchangeRate)}` : ''}
        </p>
      </div>

      <header className="no-print mb-2 flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-2.5 text-primary ring-1 ring-primary/20">
            <Calculator className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight">محاسبه‌گر ارز</h1>
            <p className="text-sm text-muted-foreground">خلاصه حساب، پرداخت‌ها و سوابق کاری</p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end md:w-auto">
         {isAdmin && (
            <div className="w-full sm:w-auto">
              <Label>نرخ دلار به تومان</Label>
              <Input
                type="number"
                placeholder="مثال: ۵۰۰۰۰"
                value={exchangeRate || ''}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                className="w-full text-center font-headline text-lg font-tabular md:w-48"
              />
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                خروجی
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="ml-2 h-4 w-4" />
                اکسل (.xls)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportHtml}>
                <FileCode2 className="ml-2 h-4 w-4" />
                HTML زیبا
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="ml-2 h-4 w-4" />
                چاپ / PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Card className="print-summary print-card payslip-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl">خلاصه حساب</CardTitle>
              <CardDescription>نمای فیش‌مانند از درآمد و بدهی</CardDescription>
            </div>
            <Badge variant="secondary" className="no-print font-tabular">
              {formatNumber(totalHours)} ساعت
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="metric-tile space-y-1">
            <p className="text-xs text-muted-foreground">جمع ساعات</p>
            <p className="font-headline text-2xl font-tabular">{formatNumber(totalHours)}</p>
          </div>
          <div className="metric-tile space-y-1">
            <p className="text-xs text-muted-foreground">جمع درآمد</p>
            <p className="font-headline text-2xl font-tabular">{formatUSD(totalEarningsUSD)}</p>
          </div>
          <div className="metric-tile space-y-1">
            <p className="text-xs text-muted-foreground">پرداختی (دلار)</p>
            <p className="font-headline text-2xl font-tabular text-emerald-400">{formatUSD(totalPaymentsUSD)}</p>
          </div>
          <div className="metric-tile space-y-1">
            <p className="text-xs text-muted-foreground">پرداختی (تومان)</p>
            <p className="font-headline text-lg font-tabular text-emerald-400">{formatIRT(totalPaymentsIRT)}</p>
          </div>
          <div className="metric-tile col-span-2 space-y-1 border-destructive/30 bg-destructive/5 md:col-span-1 lg:col-span-2">
            <p className="text-xs text-muted-foreground">بدهی باقی‌مانده</p>
            <p className="font-headline text-2xl font-tabular text-destructive">{formatUSD(balanceUSD)}</p>
            <p className="text-sm font-tabular text-destructive/90">
              {exchangeRate > 0 ? formatIRT(balanceIRT) : 'نرخ را وارد کنید'}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-4 border-t bg-muted/20">
          {isAdmin && (
            <Button onClick={handleGenerateSummary} disabled={isAiLoading} className="no-print">
              <Bot className="ml-2" />
              {isAiLoading ? 'در حال تولید...' : 'خلاصه با هوش مصنوعی'}
            </Button>
          )}
          {aiSummary && (
            <div className="w-full rounded-xl border bg-background/60 p-4 text-sm leading-7">
              <p className="whitespace-pre-wrap font-body">{aiSummary}</p>
            </div>
          )}
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="print-manual print-card flex flex-col">
          <CardHeader>
             <div className="flex flex-wrap justify-between items-center gap-2">
                 <div>
                    <CardTitle>سوابق کاری دستی</CardTitle>
                    <CardDescription>
                      سوابق کاری ثبت شده به صورت دستی.
                    </CardDescription>
                 </div>
                {isAdmin && (
                  <Dialog open={isWorkLogDialogOpen} onOpenChange={(isOpen) => {
                      if(!isOpen) closeWorkLogDialog();
                      setWorkLogDialogOpen(isOpen);
                  }}>
                      <DialogTrigger asChild>
                          <Button variant="outline" className="no-print" onClick={() => setEditingWorkLog(null)}><PlusCircle className="ml-2" /> افزودن دستی</Button>
                      </DialogTrigger>
                      <DialogContent className="no-print">
                          <DialogHeader>
                              <DialogTitle>{editingWorkLog ? 'ویرایش' : 'افزودن'} رکورد کاری</DialogTitle>
                          </DialogHeader>
                          <Form {...workLogForm}>
                              <form onSubmit={workLogForm.handleSubmit(handleWorkLogSubmit)} className="space-y-4">
                                  <FormField control={workLogForm.control} name="description" render={({ field }) => (
                                      <FormItem>
                                          <FormLabel>شرح</FormLabel>
                                          <FormControl><Textarea placeholder="مثال: کار روی پروژه X" {...field} /></FormControl>
                                          <FormMessage />
                                      </FormItem>
                                  )} />
                                  <div className="grid grid-cols-2 gap-4">
                                      <FormField control={workLogForm.control} name="hours" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>ساعت</FormLabel>
                                              <FormControl><Input type="number" {...field} /></FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )} />
                                      <FormField control={workLogForm.control} name="rate" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>نرخ (دلار)</FormLabel>
                                              <FormControl><Input type="number" {...field} /></FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )} />
                                  </div>
                                   <div className="grid grid-cols-2 gap-4">
                                       <FormField control={workLogForm.control} name="start" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>شروع</FormLabel>
                                              <FormControl><Input type="datetime-local" {...field} /></FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )} />
                                      <FormField control={workLogForm.control} name="end" render={({ field }) => (
                                          <FormItem>
                                              <FormLabel>پایان</FormLabel>
                                              <FormControl><Input type="datetime-local" {...field} /></FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )} />
                                   </div>
                                  <div className="flex justify-end gap-2">
                                      <DialogClose asChild>
                                        <Button type="button" variant="secondary" onClick={closeWorkLogDialog}>انصراف</Button>
                                      </DialogClose>
                                      <Button type="submit">ذخیره</Button>
                                  </div>
                              </form>
                          </Form>
                      </DialogContent>
                  </Dialog>
                )}
             </div>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden">
            <ScrollArea className="print-expand h-[400px] pr-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>شرح</TableHead>
                      <TableHead>شروع</TableHead>
                      <TableHead>پایان</TableHead>
                      <TableHead className="text-right">ساعات</TableHead>
                      <TableHead className="text-right">نرخ</TableHead>
                      <TableHead className="text-right">جمع</TableHead>
                      {isAdmin && <TableHead className="w-[100px] no-print"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualWorkLogs.length > 0 ? (
                      manualWorkLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium max-w-[150px] truncate">
                            {log.description}
                          </TableCell>
                          <TableCell className="font-code text-xs whitespace-nowrap font-tabular">
                            {formatDateTime(log.start)}
                          </TableCell>
                          <TableCell className="font-code text-xs whitespace-nowrap font-tabular">
                            {formatDateTime(log.end)}
                          </TableCell>
                          <TableCell className="text-right font-code font-tabular">
                            {formatNumber(log.hours)}
                          </TableCell>
                          <TableCell className="text-right font-code font-tabular">
                            {formatUSD(log.rate)}
                          </TableCell>
                          <TableCell className="text-right font-headline font-tabular">
                            {formatUSD(log.hours * log.rate)}
                          </TableCell>
                          {isAdmin && (
                            <TableCell className="no-print space-x-1 text-right">
                              {log.id && (
                                  <>
                                      <Button variant="ghost" size="icon" onClick={() => { setEditingWorkLog(log); setWorkLogDialogOpen(true); }}>
                                          <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteWorkLog(log.id!)}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 7: 6} className="text-center py-8">
                          رکوردی به صورت دستی اضافه نشده است.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        
        <Card className="print-payments print-card flex flex-col">
          <CardHeader>
             <div className="flex flex-wrap justify-between items-center gap-2">
                 <div>
                    <CardTitle>پرداخت‌ها</CardTitle>
                    <CardDescription>تمام پرداخت‌های دریافت شده را ثبت کنید.</CardDescription>
                 </div>
                {isAdmin && (
                  <Dialog
                    open={isPaymentDialogOpen}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) closePaymentDialog();
                        setPaymentDialogOpen(isOpen);
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button onClick={() => setEditingPayment(null)} className="mt-2 w-full md:w-auto no-print">
                        <PlusCircle className="ml-2" /> افزودن پرداخت
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="no-print">
                      <DialogHeader>
                        <DialogTitle>{editingPayment ? 'ویرایش' : 'افزودن'} پرداخت</DialogTitle>
                      </DialogHeader>
                      <Form {...paymentForm}>
                        <form
                          onSubmit={paymentForm.handleSubmit(handlePaymentSubmit)}
                          className="space-y-4"
                        >
                          <FormField
                            control={paymentForm.control}
                            name="amountIRT"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>مبلغ (تومان)</FormLabel>
                                <FormControl>
                                  <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={paymentForm.control}
                            name="exchangeRate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>نرخ دلار به تومان (زمان پرداخت)</FormLabel>
                                <FormControl>
                                  <Input type="number" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                           <FormField
                            control={paymentForm.control}
                            name="date"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>تاریخ پرداخت</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={'outline'}
                                        className={cn(
                                          'w-full pl-3 text-left font-normal',
                                          !field.value && 'text-muted-foreground'
                                        )}
                                      >
                                        {field.value ? (
                                          format(field.value, 'PPP')
                                        ) : (
                                          <span>یک تاریخ انتخاب کنید</span>
                                        )}
                                        <CalendarIcon className="mr-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      disabled={(date) =>
                                        date > new Date() || date < new Date('1900-01-01')
                                      }
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={paymentForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>شرح (اختیاری)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="مثال: پرداخت برای پروژه X"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="submit">ذخیره پرداخت</Button>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                )}
             </div>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden">
            <ScrollArea className="print-expand h-[400px] pr-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شرح</TableHead>
                    <TableHead className="text-right">مبلغ (تومان)</TableHead>
                    <TableHead className="text-right">نرخ</TableHead>
                    <TableHead className="text-right">مبلغ (دلار)</TableHead>
                    {isAdmin && <TableHead className="w-[100px] no-print"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length > 0 ? (
                    payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-tabular">
                          {new Date(p.date).toLocaleDateString('fa-IR')}
                        </TableCell>
                         <TableCell>{p.description || '-'}</TableCell>
                        <TableCell className="text-right font-code font-tabular">
                          {formatNumber(p.amountIRT)}
                        </TableCell>
                        <TableCell className="text-right font-code font-tabular">
                          {formatNumber(p.exchangeRate)}
                        </TableCell>
                        <TableCell className="text-right font-headline font-tabular">
                          {formatUSD(p.amountIRT / p.exchangeRate)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="no-print space-x-1 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setEditingPayment(p); setPaymentDialogOpen(true); }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeletePayment(p.id!)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8">
                        هنوز پرداختی ثبت نشده است.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

      </div>

     
      <Card className="print-clockify print-card">
           <CardHeader>
             <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                    <CardTitle>سوابق کاری Clockify</CardTitle>
                    <CardDescription>
                      سوابق کاری همگام‌شده از Clockify
                      {clockifyWorkLogs.length > 0 ? ` · ${clockifyWorkLogs.length} رکورد` : ''}.
                      در چاپ به‌صورت اسکرول‌شونده در انتهای صفحه می‌ماند.
                    </CardDescription>
                </div>
                {isAdmin && (
                  <div className='flex gap-2 no-print'>
                      <Button onClick={handleSyncClockify} disabled={isSyncing}>
                        <RefreshCw className={cn("ml-2", isSyncing && "animate-spin")} />
                        {isSyncing ? 'در حال دریافت...' : 'همگام‌سازی'}
                      </Button>
                  </div>
                )}
            </div>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden">
            <ScrollArea className="print-keep-scroll h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">شرح</TableHead>
                    <TableHead>شروع</TableHead>
                    <TableHead>پایان</TableHead>
                    <TableHead className="text-right">ساعات</TableHead>
                    <TableHead className="text-right">نرخ</TableHead>
                    <TableHead className="text-right">جمع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isSyncing && clockifyWorkLogs.length === 0 ? (
                      <>
                          <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                          <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                          <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                      </>
                  ) : clockifyWorkLogs.length > 0 ? (
                    clockifyWorkLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.description}
                        </TableCell>
                        <TableCell className="font-tabular">
                          {formatDateTime(log.start)}
                        </TableCell>
                        <TableCell className="font-tabular">
                          {formatDateTime(log.end)}
                        </TableCell>
                        <TableCell className="text-right font-code font-tabular">
                          {formatNumber(log.hours)}
                        </TableCell>
                        <TableCell className="text-right font-code font-tabular">
                          {formatUSD(log.rate)}
                        </TableCell>
                        <TableCell className="text-right font-headline font-tabular">
                          {formatUSD(log.hours * log.rate)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        برای نمایش اطلاعات، با Clockify همگام‌سازی کنید.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
