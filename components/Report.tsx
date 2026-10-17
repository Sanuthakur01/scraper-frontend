'use client';

import { useRef, useState } from 'react';
import { useApi } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { ReportResponse } from '@/lib/types';
import ReportImage, { REPORT_HEIGHT, REPORT_WIDTH, reportRange, weekChange } from './ReportImage';

// The same report as WhatsApp text (*bold* is WhatsApp's own formatting).
function whatsappText(r: ReportResponse) {
  const n = formatNumber;
  const lines = [
    '*India job market: data roles*',
    `${reportRange(r)} (last 7 days)`,
    '',
    `*${n(r.total)} new openings* for ${r.experience.min}–${r.experience.max} years' experience`,
    '',
  ];
  for (const course of r.courses) {
    const change = weekChange(course.count, course.previous);
    const vs = change == null ? '' : ` (${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the week before)`;
    lines.push(`*${course.name}*: ${n(course.count)}${vs}`);
    if (course.skills.length) lines.push(`Top skills: ${course.skills.join(', ')}`);
    lines.push('');
  }
  if (r.companies.length) lines.push(`*Top hiring companies*: ${r.companies.map((c) => c.name).join(', ')}`);
  if (r.cities.length) lines.push(`*Top cities*: ${r.cities.map((c) => c.name).join(', ')}`);
  lines.push(
    '',
    `Source: ${n(r.total)} job postings from ${r.platforms.join(', ')}, collected by ${r.brand}. India only; large IT services firms excluded.`,
  );
  return lines.join('\n');
}

// Draws the report SVG onto a canvas and saves it as a PNG file.
async function downloadPng(svg: SVGSVGElement, fileName: string) {
  const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The image could not be drawn.'));
      image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = REPORT_WIDTH;
    canvas.height = REPORT_HEIGHT;
    canvas.getContext('2d')?.drawImage(image, 0, 0, REPORT_WIDTH, REPORT_HEIGHT);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('The image could not be saved.');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } finally {
    URL.revokeObjectURL(source);
  }
}

// The weekly job market report, ready to share: an image for Instagram / LinkedIn and text for
// WhatsApp. It always shows the latest 7 days, so it is up to date after every collection.
export default function Report() {
  const state = useApi<ReportResponse>('report');
  const imageBox = useRef<HTMLDivElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const report = state.data;

  if (state.error) return <p className="page-error">Could not load the report: {state.error.message}</p>;
  if (!report) return <p className="page-loading">Loading…</p>;

  const text = whatsappText(report);
  const flash = (note: string) => {
    setMessage(note);
    setTimeout(() => setMessage(''), 3000);
  };
  const saveImage = async () => {
    const svg = imageBox.current?.querySelector('svg');
    if (!svg) return;
    try {
      await downloadPng(svg, `job-market-report-${report.to}.png`);
      flash('Image downloaded');
    } catch (err) {
      flash((err as Error).message);
    }
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard access (e.g. not https): copy the selected text the old way.
      textBox.current?.select();
      document.execCommand('copy');
    }
    flash('Text copied: paste it into WhatsApp');
  };

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Share · {reportRange(report)}</p>
          <h1>Weekly job market report</h1>
          <p className="subtitle">The last 7 days of new openings, ready to post. It updates itself after every collection.</p>
        </div>
        <div className="refresh">
          <p>Last updated: {formatDateTime(report.lastRefreshed)}</p>
          {!report.comparable && <p>Week-on-week change appears once there is a full earlier week of data.</p>}
        </div>
      </header>

      <div className="report-actions">
        <button type="button" className="small-button primary" onClick={saveImage}>
          Download image (Instagram / LinkedIn)
        </button>
        <button type="button" className="small-button" onClick={copyText}>
          Copy text for WhatsApp
        </button>
        {message && (
          <span className="saved-note" role="status">
            {message}
          </span>
        )}
      </div>

      <div className="report-layout">
        <section className="card">
          <h2>Image</h2>
          <div className="report-preview" ref={imageBox}>
            <ReportImage report={report} />
          </div>
        </section>
        <section className="card">
          <h2>WhatsApp text</h2>
          <textarea ref={textBox} className="whatsapp-text" readOnly value={text} rows={24} aria-label="WhatsApp text" />
        </section>
      </div>
    </main>
  );
}
