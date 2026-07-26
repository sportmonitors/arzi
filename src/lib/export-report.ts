import type {Payment, WorkLog} from '@/types';

export type ReportSnapshot = {
  generatedAt: Date;
  exchangeRate: number;
  totalHours: number;
  totalEarningsUSD: number;
  totalPaymentsIRT: number;
  totalPaymentsUSD: number;
  balanceUSD: number;
  balanceIRT: number;
  payments: Payment[];
  manualWorkLogs: WorkLog[];
  clockifyWorkLogs: WorkLog[];
};

const formatUSD = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

const formatIRT = (amount: number) =>
  `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`;

const formatNumber = (num: number) =>
  new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(num);

const formatFaDate = (value: number | string) => {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  } catch {
    return '-';
  }
};

const formatFaDateTime = (value: string) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'تاریخ نامعتبر';
  }
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const sheetRows = (headers: string[], rows: (string | number)[][]) => {
  const headerRow = `<Row>${headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const isNumber = typeof cell === 'number' && Number.isFinite(cell);
            return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${escapeXml(
              String(cell)
            )}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('');
  return headerRow + body;
};

export const downloadExcelReport = (report: ReportSnapshot) => {
  const summaryRows = sheetRows(
    ['عنوان', 'مقدار'],
    [
      ['تاریخ گزارش', formatFaDate(report.generatedAt.getTime())],
      ['نرخ دلار', report.exchangeRate || '-'],
      ['جمع ساعات', report.totalHours],
      ['جمع درآمد (USD)', Number(report.totalEarningsUSD.toFixed(2))],
      ['جمع پرداختی (USD)', Number(report.totalPaymentsUSD.toFixed(2))],
      ['جمع پرداختی (IRT)', report.totalPaymentsIRT],
      ['بدهی (USD)', Number(report.balanceUSD.toFixed(2))],
      ['بدهی (IRT)', Number(report.balanceIRT.toFixed(0))],
    ]
  );

  const paymentRows = sheetRows(
    ['تاریخ', 'شرح', 'مبلغ تومان', 'نرخ', 'مبلغ دلار'],
    report.payments.map((p) => [
      formatFaDate(p.date),
      p.description || '-',
      p.amountIRT,
      p.exchangeRate,
      Number((p.amountIRT / p.exchangeRate).toFixed(2)),
    ])
  );

  const toWorkRows = (logs: WorkLog[]) =>
    sheetRows(
      ['شرح', 'شروع', 'پایان', 'ساعات', 'نرخ', 'جمع'],
      logs.map((log) => [
        log.description,
        formatFaDateTime(log.start),
        formatFaDateTime(log.end),
        Number(log.hours.toFixed(2)),
        log.rate,
        Number((log.hours * log.rate).toFixed(2)),
      ])
    );

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="خلاصه"><Table>${summaryRows}</Table></Worksheet>
 <Worksheet ss:Name="پرداخت‌ها"><Table>${paymentRows}</Table></Worksheet>
 <Worksheet ss:Name="کار دستی"><Table>${toWorkRows(report.manualWorkLogs)}</Table></Worksheet>
 <Worksheet ss:Name="Clockify"><Table>${toWorkRows(report.clockifyWorkLogs)}</Table></Worksheet>
</Workbook>`;

  downloadBlob(
    new Blob([`\ufeff${xml}`], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    }),
    `arz-report-${stamp()}.xls`
  );
};

export const downloadHtmlReport = (report: ReportSnapshot) => {
  const paymentTable = report.payments
    .map(
      (p) => `<tr>
        <td>${formatFaDate(p.date)}</td>
        <td>${escapeXml(p.description || '-')}</td>
        <td class="num">${formatNumber(p.amountIRT)}</td>
        <td class="num">${formatNumber(p.exchangeRate)}</td>
        <td class="num">${formatUSD(p.amountIRT / p.exchangeRate)}</td>
      </tr>`
    )
    .join('');

  const workTable = (logs: WorkLog[]) =>
    logs
      .map(
        (log) => `<tr>
          <td>${escapeXml(log.description)}</td>
          <td>${formatFaDateTime(log.start)}</td>
          <td>${formatFaDateTime(log.end)}</td>
          <td class="num">${formatNumber(log.hours)}</td>
          <td class="num">${formatUSD(log.rate)}</td>
          <td class="num">${formatUSD(log.hours * log.rate)}</td>
        </tr>`
      )
      .join('');

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>گزارش محاسبه‌گر ارز</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --accent: #0f766e;
      --danger: #b91c1c;
      --soft: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Vazirmatn, sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #ecfeff 0%, #f8fafc 40%, #fff 100%);
      padding: 32px 16px 64px;
    }
    .sheet {
      max-width: 960px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    .hero {
      padding: 28px 32px;
      background: linear-gradient(135deg, #0f766e, #115e59 55%, #134e4a);
      color: #fff;
    }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; opacity: 0.85; }
    .payslip {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding: 24px 32px;
      background: var(--soft);
      border-bottom: 1px solid var(--line);
    }
    .metric {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px 16px;
    }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .metric strong { font-size: 22px; font-variant-numeric: tabular-nums; }
    .metric.debt strong { color: var(--danger); }
    .metric.ok strong { color: var(--accent); }
    section { padding: 24px 32px; }
    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--accent);
      display: inline-block;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: right; }
    th { color: var(--muted); font-weight: 600; background: #f1f5f9; }
    .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .foot { padding: 16px 32px 28px; color: var(--muted); font-size: 12px; }
    @media (max-width: 720px) {
      .payslip { grid-template-columns: 1fr; }
      section, .hero, .foot { padding-inline: 18px; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>فیش خلاصه حساب</h1>
      <p>تاریخ صدور: ${formatFaDate(report.generatedAt.getTime())} · نرخ دلار: ${
        report.exchangeRate ? formatNumber(report.exchangeRate) : '—'
      }</p>
    </div>
    <div class="payslip">
      <div class="metric"><span>جمع ساعات</span><strong>${formatNumber(report.totalHours)}</strong></div>
      <div class="metric"><span>جمع درآمد</span><strong>${formatUSD(report.totalEarningsUSD)}</strong></div>
      <div class="metric ok"><span>جمع پرداختی (دلار)</span><strong>${formatUSD(report.totalPaymentsUSD)}</strong></div>
      <div class="metric ok"><span>جمع پرداختی (تومان)</span><strong>${formatIRT(report.totalPaymentsIRT)}</strong></div>
      <div class="metric debt"><span>بدهی (دلار)</span><strong>${formatUSD(report.balanceUSD)}</strong></div>
      <div class="metric debt"><span>بدهی (تومان)</span><strong>${
        report.exchangeRate > 0 ? formatIRT(report.balanceIRT) : 'نرخ را وارد کنید'
      }</strong></div>
    </div>
    <section>
      <h2>پرداخت‌ها</h2>
      <table>
        <thead><tr><th>تاریخ</th><th>شرح</th><th>مبلغ تومان</th><th>نرخ</th><th>مبلغ دلار</th></tr></thead>
        <tbody>${paymentTable || '<tr><td colspan="5">پرداختی ثبت نشده</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>سوابق کاری دستی</h2>
      <table>
        <thead><tr><th>شرح</th><th>شروع</th><th>پایان</th><th>ساعات</th><th>نرخ</th><th>جمع</th></tr></thead>
        <tbody>${workTable(report.manualWorkLogs) || '<tr><td colspan="6">رکورد دستی نیست</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>سوابق Clockify (خلاصه تعداد: ${report.clockifyWorkLogs.length})</h2>
      <table>
        <thead><tr><th>شرح</th><th>شروع</th><th>پایان</th><th>ساعات</th><th>نرخ</th><th>جمع</th></tr></thead>
        <tbody>${workTable(report.clockifyWorkLogs) || '<tr><td colspan="6">داده‌ای نیست</td></tr>'}</tbody>
      </table>
    </section>
    <div class="foot">تولید شده توسط محاسبه‌گر ارز · ${escapeXml(report.generatedAt.toISOString())}</div>
  </div>
</body>
</html>`;

  downloadBlob(
    new Blob([html], {type: 'text/html;charset=utf-8'}),
    `arz-report-${stamp()}.html`
  );
};
