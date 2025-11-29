import {NextResponse} from 'next/server';

// This is our proxy API route. It fetches data from the Clockify shared report URL.
// We use a proxy to avoid CORS issues that would happen if the browser tried to fetch directly.
export async function GET() {
  try {
    const reportUrl =
      'https://app.clockify.me/report/shared/692acd86bf199e181d39f05f';
    const response = await fetch(reportUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
      // Revalidate every hour
      next: { revalidate: 3600 } 
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch report: ${response.statusText}`);
    }

    const data = await response.json();

    // We only need the timeentries part of the report
    const timeentries = data?.timeentries || [];

    return NextResponse.json(timeentries);
  } catch (error) {
    console.error('Error fetching Clockify report:', error);
    return NextResponse.json(
      {message: 'Error fetching Clockify report'},
      {status: 500}
    );
  }
}
