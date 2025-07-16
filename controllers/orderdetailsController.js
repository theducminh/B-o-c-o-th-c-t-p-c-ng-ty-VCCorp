
const sql = require('mssql');

// Lấy toàn bộ danh sách chi tiết đơn hàng có cùng order_id
exports.getAllOrderDetails = async (req, res) => {
  const orderId = req.params.order_id;
  try {
    const result = await req.pool.request()
      .input('id', sql.VarChar, orderId)
      .query('SELECT * FROM OrderDetails WHERE order_id = @id ORDER BY product_id');
    res.json(result.recordset);
  } catch (err) {
    console.error('Lỗi khi lấy danh sách chi tiết đơn hàng:', err);
    res.status(500).json({ error: err.message });
  }
};

// Lấy chi tiết đơn hàng theo order_id và product_id
exports.getOrderDetailById = async (req, res) => {
  const orderId = req.params.order_id;
  const productId = req.params.product_id;
  try {
    const result = await req.pool.request()
      .input('id', sql.VarChar, orderId)
      .input('productId', sql.VarChar, productId)
      .query('SELECT * FROM OrderDetails WHERE order_id = @id AND product_id = @productId');
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ message: 'Không tìm thấy chi tiết đơn hàng với ID này' });
    }
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu chi tiết đơn hàng', error: err.message });
  }
};

// Thêm chi tiết đơn hàng mới
exports.addOrderDetail = async (req, res) => {
  const { order_id, product_id, quantity, price } = req.body;
  // Kiểm tra dữ liệu đầu vào
  if (!order_id || !product_id || !quantity || !price) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin!' });
  }
  try {
    const query = `INSERT INTO OrderDetails (order_id, product_id, quantity, price)
    VALUES (@order_id, @product_id, @quantity, @price)`;
    await req.pool.request()
      .input('order_id', sql.VarChar, order_id)
      .input('product_id', sql.VarChar, product_id)
      .input('quantity', sql.Int, quantity)
      .input('price', sql.Decimal(10,2), price)
      .query(query);
    res.status(201).json({ message: 'Chi tiết đơn hàng đã được thêm thành công!' });
  } catch (err) {
    console.error('Lỗi khi thêm chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi khi thêm chi tiết đơn hàng', error: err.message });
  }
};

// Cập nhật thông tin chi tiết đơn hàng
exports.updateOrderDetail = async (req, res) => {
  const oldOrderId = req.params.order_id;
   const oldProductId = req.params.product_id; 

  const { order_id, product_id, quantity, price } = req.body;
  // Kiểm tra dữ liệu đầu vào
  if (!order_id || !product_id || !quantity || !price) {
    return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin!' });
  }
  try {
    const query = `UPDATE OrderDetails SET order_id = @order_id, product_id = @product_id, quantity = @quantity, price = @price
    WHERE order_id = @oldOrderId and product_id = @oldProductId`;
    await req.pool.request()
      .input('oldOrderId', sql.VarChar, oldOrderId)
      .input('oldProductId', sql.VarChar, oldProductId)
      .input('order_id', sql.VarChar, order_id)
      .input('product_id', sql.VarChar, product_id)
      .input('quantity', sql.Int, quantity)
      .input('price', sql.Decimal(10,2), price)
      .query(query);
    res.status(200).json({ message: 'Chi tiết đơn hàng đã được cập nhật thành công!' });
  } catch (err) {
    console.error('Lỗi khi cập nhật chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi khi cập nhật chi tiết đơn hàng', error: err.message });
  }
};

exports.deleteOrderDetail = async (req, res) => {
  const Id = req.params.id;

  try {
    const result = await req.pool.request()
      .input('id', sql.Int, Id)
      .query(`
        DECLARE @DeletedRows TABLE (
          order_id VARCHAR(50),
          product_id VARCHAR(50),
          quantity INT,
          price DECIMAL(10, 2)
        );

        DELETE FROM OrderDetails
        OUTPUT deleted.order_id, deleted.product_id, deleted.quantity, deleted.price INTO @DeletedRows
        WHERE id = @id;

        SELECT * FROM @DeletedRows;
      `);

    console.log('rowsAffected:', result.rowsAffected);
    console.log('deleted rows:', result.recordset);

    if (result.recordset.length > 0) {
      res.status(200).json({ message: 'Chi tiết đơn hàng đã được xóa thành công!', deletedDetails: result.recordset });
    } else {
      res.status(404).json({ message: 'Không tìm thấy chi tiết đơn hàng với ID này' });
    }
  } catch (err) {
    console.error('Lỗi khi xóa chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi khi xóa chi tiết đơn hàng', error: err.message });
  }
};

// Lấy chi tiết thep id
exports.getOrderDetailByIddetail = async (req, res) => {
  const Id = req.params.id;
  try {
    const result = await req.pool.request()
      .input('id', sql.Int, Id)
      .query('SELECT * FROM OrderDetails WHERE id = @id');
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ message: 'Không tìm thấy chi tiết đơn hàng với ID này' });
    }
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu chi tiết đơn hàng:', err);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu chi tiết đơn hàng', error: err.message });
  }
}