                    
    // Hiển thị tên đăng nhập

    const savedUsername = localStorage.getItem("loggedInUsername");
    if (savedUsername) {
        document.getElementById("usernameDisplay").innerText = savedUsername;
    }

    // Toggle dropdown
    function toggleDropdown() {
    document.getElementById("accountDropdown").classList.toggle("hidden");
    }

    // Đăng xuất
    function logout() {
    localStorage.removeItem("username");
    window.location.href = "login.html";
    }

    // Ẩn dropdown khi click ngoài
    window.addEventListener("click", function(e) {
    const dropdown = document.getElementById("accountDropdown");
    const button = document.querySelector("#topbar button[onclick='toggleDropdown()']");
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.classList.add("hidden");
    }
    });

    function showTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    }

    function showForm(form) {
        if (form === 'employeeForm'){document.getElementById('employeeForm').classList.remove('hidden');
        }
        else if (form === 'productForm'){document.getElementById('productForm').classList.remove('hidden');}
        else if (form === 'supplierForm'){document.getElementById('supplierForm').classList.remove('hidden');}
        else if (form === 'customerForm'){document.getElementById('customerForm').classList.remove('hidden');}
        else if (form === 'orderForm'){document.getElementById('orderForm').classList.remove('hidden');}
        else if (form === 'orderDetailForm'){document.getElementById('orderDetailForm').classList.remove('hidden');}
        else if (form === 'orderDetails'){document.getElementById('orderDetails').classList.remove('hidden');}
        else if (form === 'orderdetailForm'){document.getElementById('orderdetailForm').classList.remove('hidden');}

    }

    function closeForm(form) {
        if (form === 'employeeForm') {
            document.getElementById('employeeForm').classList.add('hidden');
            document.getElementById('formEmployee').reset();
            document.getElementById('employee_id').value = '';
        } else if (form === 'productForm') {
            document.getElementById('productForm').classList.add('hidden');
            document.getElementById('formProduct').reset();
            document.getElementById('product_id').value = '';
        }
        else if (form === 'supplierForm') {
            document.getElementById('supplierForm').classList.add('hidden');
            document.getElementById('formSupplier').reset();
            document.getElementById('supplier_id').value = '';
        } else if (form === 'customerForm') {
            document.getElementById('customerForm').classList.add('hidden');
            document.getElementById('formCustomer').reset();
            document.getElementById('customer_id').value = '';
        }
        else if (form === 'orderForm') {
            document.getElementById('orderForm').classList.add('hidden');
            document.getElementById('formOrder').reset();
            document.getElementById('order_id').value = '';
        }
        else if (form === 'orderdetailForm') {
            document.getElementById('orderdetailForm').classList.add('hidden');
            document.getElementById('formOrderDetail').reset();
            document.getElementById('orderid').value = '';
        }
        else if (form === 'orderDetails') {
            document.getElementById('orderDetails').classList.add('hidden');
            document.getElementById('order_id').value = '';
        }
    
    }

    // Hàm phân tích truy vấn
async function analyzeQuery() {
    const query = document.getElementById("nlpQuery").value;

    if (!query || typeof query !== "string") {
        alert("Vui lòng nhập truy vấn hợp lệ.");
        return;
    }

    try {
        const API_URL = "http://localhost:3000/api/nlp"; // Đảm bảo URL này đúng với API của bạn
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question: query })
        });

        if (!response.ok) {
            throw new Error("Phân tích truy vấn thất bại: " + response.statusText);
        }

        const data = await response.json();
        if (data.error) {
            alert("Lỗi: " + data.error);
            return;
        }

        const ctx = document.getElementById('nlpChart').getContext('2d');
if (window.nlpChart && typeof window.nlpChart.destroy === 'function') {
    window.nlpChart.destroy();
}
        window.nlpChart = new Chart(ctx, {
      type: data.chartType,
      data: {
        labels: data.labels,
        datasets: [{
          label: data.label,
          data: data.data,
          backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1']
        }]
      }
    });

    } catch (error) {
        console.error("Lỗi khi phân tích truy vấn:", error);
        alert("Đã xảy ra lỗi khi phân tích truy vấn: " + error.message);
    }
}