import jsPDF from 'jspdf';
import { Itinerary, ActivityBlock, PrayerAnchorBlock } from '../types';

export interface PdfExportOptions {
  includeBudget?: boolean;
  includePrayerTimes?: boolean;
  includeMusallas?: boolean;
  dayScope?: 'all' | string; // 'all' or dayId
}

/**
 * Generates a clean, print-ready multi-page PDF document for the itinerary,
 * including prayer times and budget summaries.
 */
export const generateItineraryPdf = (
  itinerary: Itinerary,
  options: PdfExportOptions = {}
): jsPDF => {
  const {
    includeBudget = true,
    includePrayerTimes = true,
    includeMusallas = true,
    dayScope = 'all',
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  let currentY = margin;

  // Helper to add new page and maintain headers
  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - 16) {
      doc.addPage();
      currentY = margin + 8;
      drawRunningHeader();
    }
  };

  const drawRunningHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(109, 122, 119);
    doc.text(
      `${itinerary.title} · Safar OS Halal Travel Companion`,
      margin,
      margin - 2
    );
    doc.setDrawColor(231, 223, 213);
    doc.setLineWidth(0.3);
    doc.line(margin, margin, pageWidth - margin, margin);
    currentY = margin + 6;
  };

  // --------------------------------------------------------------------------
  // COVER / HEADER BANNER
  // --------------------------------------------------------------------------
  // Emerald Top Brand Banner
  doc.setFillColor(0, 77, 70); // #004D46
  doc.roundedRect(margin, currentY, contentWidth, 34, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(98, 250, 227); // #62FAE3
  doc.text('SAFAR OS · TRAVEL DOCUMENT & ITINERARY', margin + 6, currentY + 7);

  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(itinerary.title, margin + 6, currentY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(230, 248, 245);
  const subtitle = `${itinerary.dateRange} · ${itinerary.subtitle}`;
  doc.text(subtitle, margin + 6, currentY + 23);

  // Sync / Verified badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setFillColor(0, 104, 95); // #00685F
  doc.roundedRect(margin + 6, currentY + 26, 68, 5, 1.5, 1.5, 'F');
  doc.setTextColor(98, 250, 227);
  doc.text('HALAL DINING & PRAYER SYNCHRONIZED', margin + 9, currentY + 29.5);

  currentY += 40;

  // Collaborator Roster Info Strip
  doc.setFillColor(250, 248, 245); // #FAF8F5
  doc.setDrawColor(231, 223, 213);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 12, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(22, 28, 35);
  doc.text('Traveling Group:', margin + 4, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(109, 122, 119);
  const collabNames = itinerary.collaborators.map((c) => c.name).join(', ');
  doc.text(`${collabNames} (${itinerary.collaborators.length} travelers)`, margin + 28, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 28, 35);
  doc.text('Printed On:', margin + 120, currentY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(109, 122, 119);
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), margin + 138, currentY + 5);

  currentY += 16;

  // --------------------------------------------------------------------------
  // BUDGET SUMMARY SECTION
  // --------------------------------------------------------------------------
  if (includeBudget) {
    checkPageBreak(58);

    const cur = itinerary.budget?.currency || '$';
    const totalGoal = itinerary.budget?.totalGoal || 1500;
    const totalSpent = itinerary.activityBlocks.reduce((sum, a) => sum + (a.cost || 0), 0);
    const balance = totalGoal - totalSpent;
    const isOver = totalSpent > totalGoal;
    const percentUsed = Math.min(Math.round((totalSpent / (totalGoal || 1)) * 100), 100);

    // Section Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 104, 95); // #00685F
    doc.text('TRIP BUDGET & EXPENSE SUMMARY', margin, currentY + 2);
    doc.setDrawColor(0, 104, 95);
    doc.setLineWidth(0.5);
    doc.line(margin, currentY + 4, margin + contentWidth, currentY + 4);

    currentY += 8;

    // Budget Metric Cards in 3 Columns
    const colWidth = (contentWidth - 6) / 3;

    // Card 1: Running Total
    doc.setFillColor(245, 247, 246);
    doc.setDrawColor(220, 228, 225);
    doc.roundedRect(margin, currentY, colWidth, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(109, 122, 119);
    doc.text('TOTAL COMMITTED EXPENSES', margin + 3, currentY + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(22, 28, 35);
    doc.text(`${cur}${totalSpent.toLocaleString()}`, margin + 3, currentY + 11.5);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${percentUsed}% of target)`, margin + 30, currentY + 11.5);

    // Card 2: Budget Target
    doc.setFillColor(245, 247, 246);
    doc.roundedRect(margin + colWidth + 3, currentY, colWidth, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(109, 122, 119);
    doc.text('OVERALL BUDGET GOAL', margin + colWidth + 6, currentY + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(22, 28, 35);
    doc.text(`${cur}${totalGoal.toLocaleString()}`, margin + colWidth + 6, currentY + 11.5);

    // Card 3: Remaining / Over
    if (isOver) {
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(margin + (colWidth + 3) * 2, currentY, colWidth, 16, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(185, 28, 28);
      doc.text('OVER BUDGET VARIANCE', margin + (colWidth + 3) * 2 + 3, currentY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`+${cur}${(totalSpent - totalGoal).toLocaleString()}`, margin + (colWidth + 3) * 2 + 3, currentY + 11.5);
    } else {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(margin + (colWidth + 3) * 2, currentY, colWidth, 16, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(4, 120, 87);
      doc.text('SAFE BUFFER REMAINING', margin + (colWidth + 3) * 2 + 3, currentY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${cur}${balance.toLocaleString()}`, margin + (colWidth + 3) * 2 + 3, currentY + 11.5);
    }

    currentY += 20;

    // Categories breakdown Table
    const categories = [
      {
        name: 'Halal Dining & Cafes',
        total: itinerary.activityBlocks
          .filter((a) => a.costCategory === 'dining' || a.type === 'dining' || a.type === 'cafe')
          .reduce((s, a) => s + (a.cost || 0), 0),
      },
      {
        name: 'Sightseeing & Culture',
        total: itinerary.activityBlocks
          .filter((a) => a.costCategory === 'tickets' || a.type === 'sightseeing' || a.type === 'cultural')
          .reduce((s, a) => s + (a.cost || 0), 0),
      },
      {
        name: 'Accommodation & Stays',
        total: itinerary.activityBlocks
          .filter((a) => a.costCategory === 'accommodation')
          .reduce((s, a) => s + (a.cost || 0), 0),
      },
      {
        name: 'Transit & Passes',
        total: itinerary.activityBlocks
          .filter((a) => a.costCategory === 'transit' || a.type === 'transit')
          .reduce((s, a) => s + (a.cost || 0), 0),
      },
      {
        name: 'Shopping & Activities',
        total: itinerary.activityBlocks
          .filter(
            (a) =>
              a.costCategory === 'shopping' ||
              a.costCategory === 'other' ||
              (!a.costCategory && !['dining', 'cafe', 'sightseeing', 'cultural', 'transit'].includes(a.type))
          )
          .reduce((s, a) => s + (a.cost || 0), 0),
      },
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(22, 28, 35);
    doc.text('Category Breakdown:', margin, currentY);

    const memberCount = Math.max(itinerary.collaborators.length, 1);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(109, 122, 119);
    doc.text(`Estimated Share: ${cur}${(totalSpent / memberCount).toFixed(2)} per person (${memberCount} travelers)`, margin + 80, currentY);

    currentY += 3;

    // Table Header
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, currentY, contentWidth, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(55, 65, 81);
    doc.text('Expense Category', margin + 3, currentY + 3.8);
    doc.text('Amount Committed', margin + 90, currentY + 3.8);
    doc.text('Share of Total', margin + 140, currentY + 3.8);

    currentY += 6;

    categories.forEach((cat) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(22, 28, 35);
      doc.text(cat.name, margin + 3, currentY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`${cur}${cat.total.toLocaleString()}`, margin + 90, currentY + 3.5);
      const catPct = totalSpent > 0 ? Math.round((cat.total / totalSpent) * 100) : 0;
      doc.setFont('helvetica', 'normal');
      doc.text(`${catPct}%`, margin + 140, currentY + 3.5);

      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + 4.5, margin + contentWidth, currentY + 4.5);
      currentY += 5;
    });

    currentY += 5;
  }

  // --------------------------------------------------------------------------
  // DAILY ITINERARIES WITH PRAYER TIMES & ANCHORS
  // --------------------------------------------------------------------------
  const targetDays =
    dayScope === 'all'
      ? itinerary.days
      : itinerary.days.filter((d) => d.id === dayScope);

  targetDays.forEach((day, dayIndex) => {
    checkPageBreak(65);

    // Day Header Strip
    doc.setFillColor(0, 104, 95); // #00685F
    doc.roundedRect(margin, currentY, contentWidth, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`DAY ${day.dayNumber}: ${day.title.toUpperCase()} · ${day.city}`, margin + 4, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(day.date, margin + contentWidth - 30, currentY + 6);

    currentY += 12;

    // Daily Prayer Times Ribbon
    if (includePrayerTimes && day.prayerTimes) {
      doc.setFillColor(250, 248, 245);
      doc.setDrawColor(217, 119, 6); // amber border
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(144, 77, 0); // amber-900
      doc.text('PRAYER TIMINGS (LOCAL):', margin + 3, currentY + 4.5);

      const prayers = [
        { label: 'Fajr', time: day.prayerTimes.fajr },
        { label: 'Dhuhr', time: day.prayerTimes.dhuhr },
        { label: 'Asr', time: day.prayerTimes.asr },
        { label: 'Maghrib', time: day.prayerTimes.maghrib },
        { label: 'Isha', time: day.prayerTimes.isha },
      ];

      let prayerX = margin + 44;
      prayers.forEach((p) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(22, 28, 35);
        doc.text(p.label, prayerX, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.text(p.time, prayerX, currentY + 9.5);
        prayerX += 26;
      });

      currentY += 15;
    }

    // Combine Activities and Prayer Anchors chronologically
    const dayActivities = itinerary.activityBlocks.filter((a) => a.dayId === day.id);
    const dayAnchors = itinerary.prayerAnchors.filter((p) => p.dayId === day.id);

    type TimelineEntry =
      | { kind: 'activity'; item: ActivityBlock; sortTime: string }
      | { kind: 'prayer'; item: PrayerAnchorBlock; sortTime: string };

    const combined: TimelineEntry[] = [
      ...dayActivities.map((a) => ({ kind: 'activity' as const, item: a, sortTime: a.time })),
      ...dayAnchors.map((p) => ({ kind: 'prayer' as const, item: p, sortTime: p.time })),
    ].sort((a, b) => a.sortTime.localeCompare(b.sortTime));

    if (combined.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(109, 122, 119);
      doc.text('No activities scheduled for this day yet.', margin + 4, currentY + 4);
      currentY += 8;
    } else {
      combined.forEach((entry) => {
        if (entry.kind === 'prayer') {
          // Immovable Prayer Anchor Card
          checkPageBreak(18);

          doc.setFillColor(254, 243, 199); // amber-100
          doc.setDrawColor(245, 158, 11);
          doc.setLineWidth(0.4);
          doc.roundedRect(margin, currentY, contentWidth, 14, 2, 2, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(146, 64, 14); // amber-800
          doc.text(`[PRAYER ANCHOR] ${entry.item.name} (${entry.item.time})`, margin + 4, currentY + 5);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(180, 83, 9);
          doc.text(`Prayer Window: ${entry.item.window} (${entry.item.buffer}) · Location: ${entry.item.location}`, margin + 4, currentY + 9);
          doc.text(`Details: ${entry.item.details} · Qibla: ${entry.item.qibla}`, margin + 4, currentY + 12.5);

          currentY += 17;
        } else {
          // Regular Activity Card
          const act = entry.item;
          const cardHeight = act.cost || act.halalBadge || act.description ? 24 : 18;
          checkPageBreak(cardHeight + 4);

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(231, 223, 213);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, currentY, contentWidth, cardHeight, 2, 2, 'FD');

          // Time badge
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(0, 104, 95);
          doc.text(act.time, margin + 4, currentY + 5.5);

          // Title
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(22, 28, 35);
          doc.text(act.title, margin + 22, currentY + 5.5);

          // Cost Pill on top-right if cost is assigned
          if (act.cost && act.cost > 0) {
            const cur = itinerary.budget?.currency || '$';
            doc.setFillColor(254, 243, 199); // amber-100
            doc.roundedRect(margin + contentWidth - 32, currentY + 2, 28, 5, 1, 1, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(180, 83, 9);
            doc.text(`${cur}${act.cost.toLocaleString()}${act.paidBy ? ` (${act.paidBy})` : ''}`, margin + contentWidth - 30, currentY + 5.5);
          }

          // Location & Duration
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(109, 122, 119);
          doc.text(`${act.location} · ${act.duration}`, margin + 22, currentY + 9.5);

          // Description (truncated if long)
          if (act.description) {
            doc.setFontSize(7.5);
            doc.setTextColor(55, 65, 81);
            const wrappedDesc = doc.splitTextToSize(act.description, contentWidth - 28);
            doc.text(wrappedDesc[0], margin + 22, currentY + 14);
          }

          // Halal / Prayer space info
          let bottomY = currentY + 18.5;
          if (act.halalBadge) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(4, 120, 87);
            doc.text(`✓ ${act.halalBadge}`, margin + 22, bottomY);
          }

          if (includeMusallas && act.nearestPrayerFacilityId) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(0, 104, 95);
            doc.text('· Verified Musalla nearby', margin + 80, bottomY);
          }

          currentY += cardHeight + 3;
        }
      });
    }

    currentY += 5;
  });

  // --------------------------------------------------------------------------
  // FOOTER & PAGE NUMBERING
  // --------------------------------------------------------------------------
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);

    // Footer divider line
    doc.setDrawColor(231, 223, 213);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.text(
      'Safar OS · Muslim Family Travel Itinerary & Prayer Companion',
      margin,
      pageHeight - 6
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - 20,
      pageHeight - 6
    );
  }

  return doc;
};
