import { useState } from 'react'
import './App.css'

interface RevenueData {
  date: string;
  revenue: number;
}

function App() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [metrics, setMetrics] = useState<{cagr?: number, avgGrowth?: number}>({});

  const fetchRevenue = async (symbol: string) => {
    setLoading(true);
    setError('');
    setRevenueData([]);
    setMetrics({});
    try {
      // Financial Modeling Prep API: Income Statement
      const res = await fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol.toUpperCase()}?limit=10&apikey=demo`);
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
      setRevenueData(revenues);
      // Calculate metrics
      if (revenues.length > 1) {
        const first = revenues[0].revenue;
        const last = revenues[revenues.length - 1].revenue;
        const years = revenues.length - 1;
        const cagr = first > 0 && last > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : undefined;
        let growthRates = [];
        for (let i = 1; i < revenues.length; i++) {
          if (revenues[i-1].revenue > 0) {
            growthRates.push(((revenues[i].revenue - revenues[i-1].revenue) / revenues[i-1].revenue) * 100);
          }
        }
        const avgGrowth = growthRates.length ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : undefined;
        setMetrics({ cagr, avgGrowth });
      }
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
          <h2>Revenue (Last 10 Years)</h2>
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
                  <td>{r.date}</td>
                  <td>{r.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="metrics">
            {metrics.cagr !== undefined && (
              <div><strong>CAGR:</strong> {metrics.cagr.toFixed(2)}%</div>
            )}
            {metrics.avgGrowth !== undefined && (
              <div><strong>Avg. YoY Growth:</strong> {metrics.avgGrowth.toFixed(2)}%</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App
