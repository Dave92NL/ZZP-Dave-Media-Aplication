/* Chart.js configuration helpers */
'use strict';

const Charts = (() => {
  const isDark = () => document.documentElement.dataset.theme !== 'light';

  function gridColor() { return isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; }
  function textColor() { return isDark() ? '#8B949E' : '#656D76'; }

  const baseOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: textColor(), font: { family: 'Inter', size: 11 }, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: isDark() ? '#1C2128' : '#fff',
        titleColor: isDark() ? '#E6EDF3' : '#1F2328',
        bodyColor: isDark() ? '#8B949E' : '#656D76',
        borderColor: isDark() ? '#30363D' : '#D0D7DE',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        grid: { color: gridColor() },
        ticks: { color: textColor(), font: { size: 10 } }
      },
      y: {
        grid: { color: gridColor() },
        ticks: { color: textColor(), font: { size: 10 } }
      }
    }
  });

  const COLORS = {
    orange:  'rgba(247,129,102,',
    blue:    'rgba(88,166,255,',
    green:   'rgba(63,185,80,',
    yellow:  'rgba(210,153,34,',
    red:     'rgba(248,81,73,',
    purple:  'rgba(188,140,255,',
    teal:    'rgba(50,190,185,',
    pink:    'rgba(230,100,150,'
  };

  const PALETTE = Object.values(COLORS).map(c => c + '0.85)');
  const PALETTE_BG = Object.values(COLORS).map(c => c + '0.2)');

  function createLineChart(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds, i) => ({
          tension: 0.4,
          fill: false,
          borderWidth: 2,
          pointRadius: 3,
          borderColor: PALETTE[i],
          backgroundColor: PALETTE_BG[i],
          pointBackgroundColor: PALETTE[i],
          ...ds
        }))
      },
      options: {
        ...baseOptions(),
        plugins: {
          ...baseOptions().plugins,
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}`
            }
          }
        }
      }
    });
  }

  function createBarChart(canvasId, labels, datasets, options = {}) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((ds, i) => ({
          borderRadius: 4,
          backgroundColor: options.colorIndex !== undefined ? PALETTE[options.colorIndex + i] : PALETTE[i],
          borderColor: 'transparent',
          ...ds
        }))
      },
      options: {
        ...baseOptions(),
        scales: {
          ...baseOptions().scales,
          x: { ...baseOptions().scales.x, stacked: !!options.stacked },
          y: { ...baseOptions().scales.y, stacked: !!options.stacked }
        }
      }
    });
  }

  function createDoughnutChart(canvasId, labels, data, colors) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    const bgColors = colors || PALETTE.slice(0, data.length);
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: 'transparent', hoverBorderColor: 'var(--bg-secondary)' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor(), font: { size: 11 }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: {
              label: ctx => `${ctx.label}: €${Number(ctx.parsed).toFixed(2)}`
            }
          }
        },
        cutout: '62%'
      }
    });
  }

  function destroyChart(chartInstance) {
    if (chartInstance && typeof chartInstance.destroy === 'function') {
      chartInstance.destroy();
    }
  }

  return { createLineChart, createBarChart, createDoughnutChart, destroyChart, COLORS, PALETTE };
})();

window.Charts = Charts;
