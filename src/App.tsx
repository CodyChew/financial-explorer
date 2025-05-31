import { useState } from 'react'
import './App.css'
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface RevenueData {
  date: string;
  revenue: number;
}

// Utility to format large numbers for y-axis
function formatLargeNumber(num: number): string {
  if (Math.abs(num) >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toLocaleString()}`;
}

// Chart.js y-axis tick callback for large numbers
const yAxisTickCallback = (tickValue: string | number) => {
  const num = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue;
  return formatLargeNumber(num);
};

function App() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [metrics, setMetrics] = useState<{
    operatingIncomeByYear?: { year: string, operatingIncome: number }[],
    netIncomeByYear?: { year: string, netIncome: number }[],
    grossMarginByYear?: { year: string, grossMarginPct: number }[],
    netMarginByYear?: { year: string, netMarginPct: number }[]
  }>({});
  const [currentRatio, setCurrentRatio] = useState<number | null>(null);
  const [currentRatioDate, setCurrentRatioDate] = useState<string | null>(null);
  const [debtToEbitda, setDebtToEbitda] = useState<number | null>(null);
  const [debtToEbitdaError, setDebtToEbitdaError] = useState<string | null>(null);

  const fetchCurrentRatio = async (symbol: string) => {
    const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      setError('Finnhub API key is missing. Please set VITE_FINNHUB_API_KEY in your .env file.');
      setCurrentRatio(null);
      setCurrentRatioDate(null);
      setDebtToEbitda(null);
      setDebtToEbitdaError(null);
      return;
    }
    try {
      const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol.toUpperCase()}&metric=all&token=${apiKey}`);
      const data = await res.json();
      if (data && data.metric) {
        // Current Ratio
        if (data.metric.currentRatioQuarterly) {
          setCurrentRatio(Number(data.metric.currentRatioQuarterly));
          setCurrentRatioDate('latest');
        } else {
          setCurrentRatio(null);
          setCurrentRatioDate(null);
        }
        // Debt to EBITDA calculation
        const totalDebt = Number(data.metric.totalDebtQuarterly);
        const ebitda = Number(data.metric.ebitdaQuarterly);
        if (totalDebt && ebitda && ebitda !== 0 && isFinite(totalDebt / ebitda)) {
          setDebtToEbitda(totalDebt / ebitda);
          setDebtToEbitdaError(null);
        } else {
          setDebtToEbitda(null);
          setDebtToEbitdaError('Debt to EBITDA data cannot be fetched for this ticker.');
        }
      } else {
        setCurrentRatio(null);
        setCurrentRatioDate(null);
        setDebtToEbitda(null);
        setDebtToEbitdaError('Debt to EBITDA data cannot be fetched for this ticker.');
      }
    } catch {
      setCurrentRatio(null);
      setCurrentRatioDate(null);
      setDebtToEbitda(null);
      setDebtToEbitdaError('Debt to EBITDA data cannot be fetched for this ticker.');
    }
  };

  const fetchRevenue = async (symbol: string) => {
    setLoading(true);
    setError('');
    setRevenueData([]);
    setMetrics({});
    setCurrentRatio(null);
    setCurrentRatioDate(null);
    setDebtToEbitda(null);
    setDebtToEbitdaError(null);
    try {
      // Financial Modeling Prep API: Income Statement
      const apiKey = import.meta.env.VITE_FMP_API_KEY;
      const res = await fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol.toUpperCase()}?limit=10&apikey=${apiKey}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError('No data found for this ticker.');
        setLoading(false);
        return;
      }
      const revenues = data.map((item: any) => ({
        date: item.date,
        revenue: item.revenue || item.revenueUSD || item.totalRevenue || 0
      })).reverse();
      // Extract operating income, net income, gross margin %, net margin % by year
      const operatingIncomeByYear = data.map((item: any) => ({
        year: item.date,
        operatingIncome: item.operatingIncome || item.operatingIncomeUSD || 0
      })).reverse();
      const netIncomeByYear = data.map((item: any) => ({
        year: item.date,
        netIncome: item.netIncome || item.netIncomeUSD || 0
      })).reverse();
      const grossMarginByYear = data.map((item: any) => {
        const revenue = item.revenue || item.revenueUSD || item.totalRevenue || 0;
        const grossProfit = item.grossProfit || item.grossProfitUSD || 0;
        return {
          year: item.date,
          grossMarginPct: revenue !== 0 ? (grossProfit / revenue) * 100 : 0
        };
      }).reverse();
      const netMarginByYear = data.map((item: any) => {
        const revenue = item.revenue || item.revenueUSD || item.totalRevenue || 0;
        const netIncome = item.netIncome || item.netIncomeUSD || 0;
        return {
          year: item.date,
          netMarginPct: revenue !== 0 ? (netIncome / revenue) * 100 : 0
        };
      }).reverse();
      setRevenueData(revenues);
      setMetrics({
        operatingIncomeByYear,
        netIncomeByYear,
        grossMarginByYear,
        netMarginByYear
      });
      fetchCurrentRatio(symbol);
    } catch (e) {
      setError('Failed to fetch data.');
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <h1>Financial Explorer</h1>
      <form
        onSubmit={e => {
          e.preventDefault();
          if (ticker) fetchRevenue(ticker);
        }}
        className="input-form"
      >
        <input
          type="text"
          placeholder="Enter Ticker (e.g. AAPL)"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
          className="ticker-input"
        />
        <button type="submit" disabled={loading || !ticker} className="submit-btn">
          {loading ? 'Loading...' : 'Search'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {revenueData.length > 0 && (
        <div className="results">
          <h2>Revenue {revenueData.length === 10 ? '(Last 10 Years)' : `(Last ${revenueData.length} Years)`}</h2>
          <div className="chart-container">
            <Line
              data={{
                labels: revenueData.map(r => r.date.slice(0, 4)),
                datasets: [
                  {
                    label: 'Revenue (USD)',
                    data: revenueData.map(r => r.revenue),
                    borderColor: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                    tension: 0.3,
                    fill: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false, labels: { color: '#e3f2fd', font: { weight: 'bold' } } },
                  title: { display: false },
                  tooltip: {
                    callbacks: { label: ctx => formatLargeNumber(ctx.parsed.y) },
                    backgroundColor: '#23293a',
                    titleColor: '#e3f2fd',
                    bodyColor: '#e3f2fd',
                    borderColor: '#394867',
                    borderWidth: 1
                  }
                },
                scales: {
                  x: {
                    title: { display: true, text: 'Year', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                    ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd' }
                  },
                  y: {
                    title: { display: true, text: 'USD', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                    ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd', callback: yAxisTickCallback }
                  }
                }
              }}
            />
            <div className="stat-desc">Total revenue reported by the company for each year.</div>
          </div>
          <table className="revenue-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Revenue (USD)</th>
              </tr>
            </thead>
            <tbody>
              {revenueData.map((r) => (
                <tr key={r.date}>
                  <td>{r.date.slice(0, 4)}</td>
                  <td>{formatLargeNumber(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="metrics-section">
            {metrics.operatingIncomeByYear && (
              <div>
                <div className="metrics-table-title">Operating Income by Year</div>
                <div className="chart-container">
                  <Line
                    data={{
                      labels: metrics.operatingIncomeByYear.map(row => row.year.slice(0, 4)),
                      datasets: [
                        {
                          label: 'Operating Income (USD)',
                          data: metrics.operatingIncomeByYear.map(row => row.operatingIncome),
                          borderColor: '#43a047',
                          backgroundColor: 'rgba(67,160,71,0.15)',
                          tension: 0.3,
                          fill: true,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false, labels: { color: '#e3f2fd', font: { weight: 'bold' } } },
                        title: { display: false },
                        tooltip: {
                          callbacks: { label: ctx => formatLargeNumber(ctx.parsed.y) },
                          backgroundColor: '#23293a',
                          titleColor: '#e3f2fd',
                          bodyColor: '#e3f2fd',
                          borderColor: '#394867',
                          borderWidth: 1
                        }
                      },
                      scales: {
                        x: {
                          title: { display: true, text: 'Year', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd' }
                        },
                        y: {
                          title: { display: true, text: 'USD', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd', callback: yAxisTickCallback }
                        }
                      }
                    }}
                  />
                  <div className="stat-desc">Operating income is the profit from core business operations, excluding taxes and interest.</div>
                </div>
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Operating Income (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.operatingIncomeByYear.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year.slice(0, 4)}</td>
                        <td>{formatLargeNumber(row.operatingIncome)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.netIncomeByYear && (
              <div>
                <div className="metrics-table-title">Net Income by Year</div>
                <div className="chart-container">
                  <Line
                    data={{
                      labels: metrics.netIncomeByYear.map(row => row.year.slice(0, 4)),
                      datasets: [
                        {
                          label: 'Net Income (USD)',
                          data: metrics.netIncomeByYear.map(row => row.netIncome),
                          borderColor: '#fbc02d',
                          backgroundColor: 'rgba(251,192,45,0.15)',
                          tension: 0.3,
                          fill: true,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false, labels: { color: '#e3f2fd', font: { weight: 'bold' } } },
                        title: { display: false },
                        tooltip: {
                          callbacks: { label: ctx => formatLargeNumber(ctx.parsed.y) },
                          backgroundColor: '#23293a',
                          titleColor: '#e3f2fd',
                          bodyColor: '#e3f2fd',
                          borderColor: '#394867',
                          borderWidth: 1
                        }
                      },
                      scales: {
                        x: {
                          title: { display: true, text: 'Year', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd' }
                        },
                        y: {
                          title: { display: true, text: 'USD', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd', callback: yAxisTickCallback }
                        }
                      }
                    }}
                  />
                  <div className="stat-desc">Net income is the company’s total profit after all expenses, taxes, and costs.</div>
                </div>
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Net Income (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.netIncomeByYear.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year.slice(0, 4)}</td>
                        <td>{formatLargeNumber(row.netIncome)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.grossMarginByYear && (
              <div>
                <div className="metrics-table-title">Gross Margin % by Year</div>
                <div className="chart-container">
                  <Line
                    data={{
                      labels: metrics.grossMarginByYear.map(row => row.year.slice(0, 4)),
                      datasets: [
                        {
                          label: 'Gross Margin (%)',
                          data: metrics.grossMarginByYear.map(row => row.grossMarginPct),
                          borderColor: '#8e24aa',
                          backgroundColor: 'rgba(142,36,170,0.15)',
                          tension: 0.3,
                          fill: true,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false, labels: { color: '#e3f2fd', font: { weight: 'bold' } } },
                        title: { display: false },
                        tooltip: {
                          callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)}%` },
                          backgroundColor: '#23293a',
                          titleColor: '#e3f2fd',
                          bodyColor: '#e3f2fd',
                          borderColor: '#394867',
                          borderWidth: 1
                        }
                      },
                      scales: {
                        x: {
                          title: { display: true, text: 'Year', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd' }
                        },
                        y: {
                          title: { display: true, text: '%', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd', callback: v => `${(+v).toFixed(2)}%` }
                        }
                      }
                    }}
                  />
                  <div className="stat-desc">Gross margin % shows the percentage of revenue left after deducting the cost of goods sold.</div>
                </div>
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Gross Margin (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.grossMarginByYear.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year.slice(0, 4)}</td>
                        <td>{row.grossMarginPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.netMarginByYear && (
              <div>
                <div className="metrics-table-title">Net Margin % by Year</div>
                <div className="chart-container">
                  <Line
                    data={{
                      labels: metrics.netMarginByYear.map(row => row.year.slice(0, 4)),
                      datasets: [
                        {
                          label: 'Net Margin (%)',
                          data: metrics.netMarginByYear.map(row => row.netMarginPct),
                          borderColor: '#d32f2f',
                          backgroundColor: 'rgba(211,47,47,0.15)',
                          tension: 0.3,
                          fill: true,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false, labels: { color: '#e3f2fd', font: { weight: 'bold' } } },
                        title: { display: false },
                        tooltip: {
                          callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)}%` },
                          backgroundColor: '#23293a',
                          titleColor: '#e3f2fd',
                          bodyColor: '#e3f2fd',
                          borderColor: '#394867',
                          borderWidth: 1
                        }
                      },
                      scales: {
                        x: {
                          title: { display: true, text: 'Year', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd' }
                        },
                        y: {
                          title: { display: true, text: '%', font: { size: 16, weight: 'bold' }, color: '#e3f2fd' },
                          ticks: { font: { size: 14, weight: 'bold' }, color: '#e3f2fd', callback: v => `${(+v).toFixed(2)}%` }
                        }
                      }
                    }}
                  />
                  <div className="stat-desc">Net margin % shows the percentage of revenue that remains as profit after all expenses.</div>
                </div>
                <table className="metrics-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Net Margin (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.netMarginByYear.map((row) => (
                      <tr key={row.year}>
                        <td>{row.year.slice(0, 4)}</td>
                        <td>{row.netMarginPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {currentRatio !== null && currentRatioDate && (
        <div className="current-ratio-section chart-container">
          <h2>Current Ratio <span style={{fontSize: '1rem', color: '#b0bec5', fontWeight: 400}}>(latest)</span></h2>
          <div style={{fontSize: '2.2rem', fontWeight: 700, color: currentRatio >= 1 ? '#43a047' : '#d32f2f'}}>
            {currentRatio.toFixed(2)}
          </div>
          <div className="stat-desc">The current ratio measures a company's ability to pay short-term obligations. A value above 1.0 is generally considered healthy.</div>
        </div>
      )}
      {debtToEbitda !== null ? (
        <div className="current-ratio-section chart-container">
          <h2>Debt to EBITDA <span style={{fontSize: '1rem', color: '#b0bec5', fontWeight: 400}}>(latest)</span></h2>
          <div style={{fontSize: '2.2rem', fontWeight: 700, color: debtToEbitda <= 3 ? '#43a047' : '#d32f2f'}}>
            {debtToEbitda.toFixed(2)}
          </div>
          <div className="stat-desc">Debt to EBITDA is a leverage ratio that measures a company's ability to pay off its debt. Lower values (typically below 3) are considered healthier.</div>
        </div>
      ) : debtToEbitdaError ? (
        <div className="current-ratio-section chart-container">
          <h2>Debt to EBITDA <span style={{fontSize: '1rem', color: '#b0bec5', fontWeight: 400}}>(latest)</span></h2>
          <div style={{fontSize: '1.1rem', color: '#d32f2f', fontWeight: 600}}>{debtToEbitdaError}</div>
        </div>
      ) : null}
        </div>
      )}
    </div>
  );
}

export default App
