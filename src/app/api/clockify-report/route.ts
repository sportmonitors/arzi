import https from 'node:https';
import {NextResponse} from 'next/server';
import {getProxyAgent, getProxyUrl} from '@/lib/proxy-agent';

export const runtime = 'nodejs';

const fetchClockifyReport = (reportUrl: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const proxyUrl = getProxyUrl();
    const request = https.get(
      reportUrl,
      {
        agent: getProxyAgent(proxyUrl),
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
      (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Failed to fetch report: ${response.statusCode || 'unknown'} ${response.statusMessage || ''}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Clockify request timed out'));
    });
    request.on('error', reject);
  });

// This is our proxy API route. It fetches data from the Clockify shared report URL.
// We use a proxy to avoid CORS issues that would happen if the browser tried to fetch directly.
export async function GET() {
  try {
    const reportUrl =
      'https://app.clockify.me/report/shared/692acd86bf199e181d39f05f?page=1&pageSize=600&dateRangeStart=&dateRangeEnd=&sortOrder=&sortColumn=';
    const data = await fetchClockifyReport(reportUrl);

    // We only need the timeentries part of the report
    const timeentries =
      data && typeof data === 'object' && 'timeentries' in data
        ? data.timeentries
        : [];

    return NextResponse.json(timeentries);
  } catch (error) {
    console.error('Error fetching Clockify report:', error);
    return NextResponse.json(
      {message: 'Error fetching Clockify report'},
      {status: 500}
    );
  }
}
