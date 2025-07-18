const sql = require('mssql');

function normalizeVN(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const ruleBasedQueries = [

  // 1. Doanh thu theo từng tháng trong năm
  {
    pattern: /(doanh thu).*(thang|tháng).*nam\s*(\d{4})/,
    extract: (match) => parseInt(match[3], 10),
    query: (year) => `
      SELECT 
        FORMAT(order_date, 'yyyy-MM') AS label,
        SUM(total_price) AS value
      FROM Orders
      WHERE YEAR(order_date) = ${year}
      GROUP BY FORMAT(order_date, 'yyyy-MM')
      ORDER BY FORMAT(order_date, 'yyyy-MM')
    `,
    label: (year) => `Doanh thu theo tháng trong năm ${year}`,
    chartType: 'bar'
  },

  // 2. Doanh thu theo từng quý trong năm (có đầy đủ cả quý 1-4)
  {
    pattern: /(doanh thu).*(quy|quý).*nam\s*(\d{4})/,
    extract: (match) => parseInt(match[3], 10),
    query: (year) => `
      WITH Quarters AS (
        SELECT 1 AS quarter
        UNION ALL SELECT 2
        UNION ALL SELECT 3
        UNION ALL SELECT 4
      )
      SELECT 
        CONCAT('Quý ', q.quarter) AS label,
        ISNULL(SUM(o.total_price), 0) AS value
      FROM Quarters q
      LEFT JOIN Orders o 
        ON DATEPART(QUARTER, o.order_date) = q.quarter
        AND YEAR(o.order_date) = ${year}
      GROUP BY q.quarter
      ORDER BY q.quarter
    `,
    label: (year) => `Doanh thu theo quý trong năm ${year}`,
    chartType: 'bar'
  },

  // 3. Doanh thu theo sản phẩm trong năm
  {
    pattern: /(doanh thu).*(san pham|sản phẩm).*nam\s*(\d{4})/,
    extract: (match) => parseInt(match[3], 10),
    query: (year) => `
      SELECT 
        p.name AS label,
        SUM(od.quantity * od.price) AS value
      FROM OrderDetails od
      JOIN Orders o ON od.order_id = o.order_id
      JOIN Products p ON od.product_id = p.product_id
      WHERE YEAR(o.order_date) = ${year}
      GROUP BY p.name
      ORDER BY SUM(od.quantity * od.price) DESC
    `,
    label: (year) => `Doanh thu theo sản phẩm trong năm ${year}`,
    chartType: 'bar'
  },
// 4. Top 5 sản phẩm bán chạy trong năm
  {
  pattern: /(san pham|sản phẩm).*(ban chay|bán chạy|top).*(nam|năm)\s*(\d{4})/,
  extract: (match) => {
    const year = parseInt(match[4], 10);
    return isNaN(year) ? null : year;
  },
  query: (year) => `
    SELECT TOP 5 
      p.name AS label,
      SUM(od.quantity) AS value
    FROM OrderDetails od
    JOIN Products p ON od.product_id = p.product_id
    JOIN Orders o ON od.order_id = o.order_id
    WHERE YEAR(o.order_date) = ${year}
    GROUP BY p.name
    ORDER BY SUM(od.quantity) DESC
  `,
  label: (year) => `Top 5 sản phẩm bán chạy trong năm ${year}`,
  chartType: 'pie'
},


// 5. Số lượng đơn hàng bán ra theo ngày trong tháng
{
  pattern: /so luong\s+(don hang|đơn hàng)(.*)?thang\s+(\d{1,2}).*nam\s+(\d{4})/,
  extract: (match) => {
    const month = parseInt(match[3], 10);
    const year = parseInt(match[4], 10);
    return (!isNaN(month) && !isNaN(year)) ? { month, year } : null;
  },
  query: ({ month, year }) => `
    SELECT 
      FORMAT(order_date, 'dd') AS label,
      COUNT(*) AS value
    FROM Orders
    WHERE MONTH(order_date) = ${month} AND YEAR(order_date) = ${year}
    GROUP BY FORMAT(order_date, 'dd')
    ORDER BY FORMAT(order_date, 'dd')
  `,
  label: ({ month, year }) => `Số lượng đơn hàng theo ngày trong tháng ${month}/${year}`,
  chartType: 'line'
}


];

exports.handleQuery = async (req, res) => {
  const { question } = req.body;
  const pool = req.pool;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Thiếu hoặc sai định dạng câu hỏi' });
  }

  if (!pool) {
    return res.status(500).json({ error: 'Không có kết nối tới cơ sở dữ liệu' });
  }

  const normalized = normalizeVN(question);

  let matched = null;
  let extractData = null;

  for (const rule of ruleBasedQueries) {
    const match = normalized.match(rule.pattern);
    console.log('Trying:', rule.pattern, 'Match:', match);
    if (match) {
      console.log('Matched pattern:', rule.pattern);
      matched = rule;

      if (rule.extract) {
        extractData = rule.extract(match);
        console.log('Extracted:', extractData);
        if (!extractData) {
          return res.status(400).json({ error: 'Không thể trích xuất dữ liệu từ câu hỏi.' });
        }
      }

      break;
    }
  }

  if (!matched) {
    return res.json({
      chartType: 'bar',
      labels: [],
      data: [],
      label: ' Không hiểu câu hỏi, vui lòng thử lại với từ khóa khác.'
    });
  }

  try {
    const sqlQuery = typeof matched.query === 'function' ? matched.query(extractData) : matched.query;
    const label = typeof matched.label === 'function' ? matched.label(extractData) : matched.label;

    const result = await pool.request().query(sqlQuery);
    const labels = result.recordset.map(r => r.label);
    const data = result.recordset.map(r => r.value);

    return res.json({
      chartType: matched.chartType,
      labels,
      data,
      label
    });
  } catch (err) {
    console.error('[Lỗi truy vấn NLP]', err.message);
    return res.status(500).json({
      error: 'Lỗi server khi truy vấn dữ liệu',
      detail: err.message
    });
  }
};
