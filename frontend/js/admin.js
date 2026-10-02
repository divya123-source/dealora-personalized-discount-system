import { api, clearSession, getStoredUser, getToken, requireAuth, setButtonLoading, showToast } from "./api.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
	"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
let products = [];
let discounts = [];
let categories = [];
let users = [];

function adminMessage(message, kind = "error") {
	const element = document.querySelector("#admin-message");
	if (!element) return;
	element.textContent = message;
	element.className = message ? `form-message form-message--${kind}` : "form-message";
}

function dateInputValue(value) {
	if (!value) return "";
	const date = new Date(value);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 16);
}

function showAccessDenied(message) {
	document.querySelector("#admin-content").hidden = true;
	const denied = document.querySelector("#admin-denied");
	denied.hidden = false;
	document.querySelector("#admin-denied-copy").textContent = message;
}

async function authorizeAdmin() {
	if (!getToken()) {
		requireAuth();
		return false;
	}
	try {
		const { user } = await api.me();
		if (user.role !== "admin") {
			showAccessDenied("This signed-in account is a customer. Sign in with an administrator account to continue.");
			return false;
		}
		sessionStorage.setItem("dealora_user", JSON.stringify(user));
		document.querySelector("#admin-content").hidden = false;
		return true;
	} catch (error) {
		if (error.status === 403) showAccessDenied(error.message);
		else if (error.status !== 401) showAccessDenied(error.message);
		return false;
	}
}

function renderStats(stats) {
	const cards = [
		["Community", stats.users, "registered people", "01"],
		["Assortment", stats.products, "products in the edit", "02"],
		["Live offers", stats.active_discounts, "active discounts", "03"],
		["Orders", stats.orders, "orders placed", "04"],
		["Saved", stats.redemptions, "offers redeemed", "05"],
		["Revenue", money(stats.revenue), "after discounts", "06"],
	];
	document.querySelector("#admin-stats").innerHTML = cards.map(([title, value, caption, index]) => `<article class="stat-card"><span class="stat-card__index">${index}</span><p>${title}</p><strong>${value}</strong><small>${caption}</small></article>`).join("");
}

function renderProducts() {
	const body = document.querySelector("#admin-products-body");
	body.innerHTML = products.length ? products.map((product) => `<tr><td><div class="table-product"><img src="${escapeHtml(product.image_url || "")}" alt="" onerror="this.style.display='none'"><strong>${escapeHtml(product.name)}</strong></div></td><td>${escapeHtml(product.category?.name || "—")}</td><td>${money(product.price)}</td><td><span class="stock-pill ${product.stock < 5 ? "stock-pill--low" : ""}">${product.stock}</span></td><td>${escapeHtml(product.brand || "—")}</td><td><div class="table-actions"><button type="button" data-edit-product="${product.id}">Edit</button><button type="button" class="danger-link" data-delete-product="${product.id}">Delete</button></div></td></tr>`).join("") : `<tr><td colspan="6" class="table-empty">No products in the edit.</td></tr>`;
}

function renderDiscounts() {
	const body = document.querySelector("#admin-discounts-body");
	body.innerHTML = discounts.length ? discounts.map((discount) => `<tr><td><strong>${escapeHtml(discount.title)}</strong><small class="table-subline">${escapeHtml(discount.description || "")}</small></td><td><code>${escapeHtml(discount.coupon_code || "—")}</code></td><td>${discount.discount_type === "percentage" ? `${discount.discount_value}%` : money(discount.discount_value)}</td><td>${money(discount.minimum_purchase)}</td><td>${new Date(discount.expiry_date).toLocaleDateString()}</td><td><span class="status-pill ${discount.is_active ? "status-pill--active" : "status-pill--inactive"}">${discount.is_active ? "Active" : "Inactive"}</span></td><td><div class="table-actions"><button type="button" data-edit-discount="${discount.id}">Edit</button><button type="button" class="danger-link" data-delete-discount="${discount.id}">Delete</button></div></td></tr>`).join("") : `<tr><td colspan="7" class="table-empty">No offers created yet.</td></tr>`;
}

function renderUsers() {
	const body = document.querySelector("#admin-users-body");
	body.innerHTML = users.length ? users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td><span class="role-pill">${escapeHtml(user.role)}</span></td><td>${new Date(user.created_at).toLocaleDateString()}</td></tr>`).join("") : `<tr><td colspan="4" class="table-empty">No customers yet.</td></tr>`;
}

function renderOrders(orders) {
	const body = document.querySelector("#admin-orders-body");
	body.innerHTML = orders.length ? orders.slice(0, 30).map((order) => `<tr><td><strong>#${order.id}</strong><small class="table-subline">${new Date(order.created_at).toLocaleDateString()}</small></td><td>${escapeHtml(order.customer_name || users.find((user) => user.id === order.user_id)?.name || `User ${order.user_id}`)}</td><td>${money(order.final_amount)}</td><td class="saved-amount">−${money(order.discount_amount)}</td><td><span class="status-pill status-pill--${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td></tr>`).join("") : `<tr><td colspan="5" class="table-empty">No orders have landed yet.</td></tr>`;
}

function renderRedemptions(records) {
	const body = document.querySelector("#admin-redemptions-body");
	body.innerHTML = records.length ? records.map((record) => `<tr><td>${escapeHtml(record.customer_name || users.find((user) => user.id === record.user_id)?.name || `User ${record.user_id}`)}</td><td><strong>${escapeHtml(record.discount_title)}</strong></td><td>#${record.order_id}</td><td>${new Date(record.redeemed_at).toLocaleString()}</td></tr>`).join("") : `<tr><td colspan="4" class="table-empty">No offers redeemed yet.</td></tr>`;
}

function populateRelatedSelects() {
	const productCategory = document.querySelector("#product-category");
	const discountCategory = document.querySelector("#discount-category");
	const discountProduct = document.querySelector("#discount-product");
	if (productCategory) productCategory.innerHTML = categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("");
	if (discountCategory) discountCategory.innerHTML = `<option value="">Any category</option>${categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}`;
	if (discountProduct) discountProduct.innerHTML = `<option value="">Any product</option>${products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join("")}`;
}

async function loadAdminData() {
	adminMessage("");
	try {
		const [dashboard, userResult, productResult, discountResult, orderResult, redemptionResult, categoryResult] = await Promise.all([
			api.adminDashboard(), api.adminUsers(), api.adminProducts(), api.adminDiscounts(),
			api.adminOrders(), api.adminRedemptions(), api.categories(),
		]);
		products = productResult.products;
		discounts = discountResult.discounts;
		users = userResult.users;
		categories = categoryResult.categories;
		renderStats(dashboard);
		renderProducts();
		renderDiscounts();
		renderUsers();
		renderOrders(orderResult.orders);
		renderRedemptions(redemptionResult.redemptions);
		populateRelatedSelects();
	} catch (error) {
		if (error.status === 403) showAccessDenied(error.message);
		else adminMessage(error.message);
	}
}

function openForm(form, title, values = {}) {
	form.hidden = false;
	form.reset();
	form.elements.id.value = values.id || "";
	Object.entries(values).forEach(([key, value]) => {
		if (!form.elements[key]) return;
		if (key === "start_date" || key === "expiry_date") form.elements[key].value = dateInputValue(value);
		else if (key === "is_active") form.elements[key].value = String(value);
		else form.elements[key].value = value ?? "";
	});
	const heading = form.querySelector("h3");
	if (heading) heading.textContent = title;
	form.scrollIntoView({ behavior: "smooth", block: "center" });
	form.querySelector("input:not([type=hidden]), select, textarea")?.focus({ preventScroll: true });
}

function closeForm(form) {
	form.hidden = true;
	form.reset();
}

async function submitProduct(event) {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const data = Object.fromEntries(new FormData(form).entries());
	const id = data.id;
	const body = {
		name: data.name.trim(), description: data.description.trim(), brand: data.brand.trim(),
		category_id: Number(data.category_id), price: Number(data.price), stock: Number(data.stock),
		image_url: data.image_url.trim() || null,
	};
	const button = form.querySelector("[type=submit]");
	setButtonLoading(button, true, "Saving");
	try {
		if (id) await api.updateProduct(id, body);
		else await api.createProduct(body);
		closeForm(form);
		await loadAdminData();
		showToast(id ? "Product updated." : "Product added to the edit.", "success");
	} catch (error) { adminMessage(error.message); }
	finally { setButtonLoading(button, false); }
}

async function submitDiscount(event) {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const data = Object.fromEntries(new FormData(form).entries());
	const id = data.id;
	const body = {
			title: data.title.trim(), description: data.description.trim(), coupon_code: data.coupon_code.trim(),
		discount_type: data.discount_type, discount_value: Number(data.discount_value),
		minimum_purchase: Number(data.minimum_purchase || 0), start_date: new Date(data.start_date).toISOString(),
		expiry_date: new Date(data.expiry_date).toISOString(), category_id: data.category_id || null,
		product_id: data.product_id || null, is_active: data.is_active === "true",
	};
	const button = form.querySelector("[type=submit]");
	setButtonLoading(button, true, "Saving");
	try {
		if (id) await api.updateDiscount(id, body);
		else await api.createDiscount(body);
		closeForm(form);
		await loadAdminData();
		showToast(id ? "Discount updated." : "Discount created.", "success");
	} catch (error) { adminMessage(error.message); }
	finally { setButtonLoading(button, false); }
}

function bindForms() {
	const productForm = document.querySelector("#product-admin-form");
	const discountForm = document.querySelector("#discount-admin-form");
	document.querySelector("[data-open-product-form]")?.addEventListener("click", () => openForm(productForm, "Add product"));
	document.querySelector("[data-open-discount-form]")?.addEventListener("click", () => openForm(discountForm, "Add discount", {
		start_date: new Date().toISOString(), expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
	}));
	document.querySelectorAll("[data-close-form], [data-cancel-form]").forEach((button) => button.addEventListener("click", () => {
		closeForm(button.closest("form"));
	}));
	productForm.addEventListener("submit", submitProduct);
	discountForm.addEventListener("submit", submitDiscount);
	document.querySelector("#admin-products-body").addEventListener("click", async (event) => {
		const edit = event.target.closest("[data-edit-product]");
		const remove = event.target.closest("[data-delete-product]");
		if (edit) {
			const product = products.find((item) => item.id === Number(edit.dataset.editProduct));
			if (product) openForm(productForm, "Edit product", { ...product, category_id: product.category_id });
		}
		if (remove) {
			const product = products.find((item) => item.id === Number(remove.dataset.deleteProduct));
			if (!product || !window.confirm(`Delete “${product.name}” from the assortment?`)) return;
			setButtonLoading(remove, true, "Deleting");
			try { await api.deleteProduct(product.id); await loadAdminData(); showToast("Product deleted.", "success"); }
			catch (error) { adminMessage(error.message); }
			finally { setButtonLoading(remove, false); }
		}
	});
	document.querySelector("#admin-discounts-body").addEventListener("click", async (event) => {
		const edit = event.target.closest("[data-edit-discount]");
		const remove = event.target.closest("[data-delete-discount]");
		if (edit) {
			const discount = discounts.find((item) => item.id === Number(edit.dataset.editDiscount));
			if (discount) openForm(discountForm, "Edit discount", discount);
		}
		if (remove) {
			const discount = discounts.find((item) => item.id === Number(remove.dataset.deleteDiscount));
			if (!discount || !window.confirm(`Delete “${discount.title}”?`)) return;
			setButtonLoading(remove, true, "Deleting");
			try { await api.deleteDiscount(discount.id); await loadAdminData(); showToast("Discount deleted.", "success"); }
			catch (error) { adminMessage(error.message); }
			finally { setButtonLoading(remove, false); }
		}
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	if (!document.querySelector("#admin-content")) return;
	document.querySelector("#admin-date").textContent = new Intl.DateTimeFormat("en-US", {
		weekday: "long", month: "long", day: "numeric", year: "numeric",
	}).format(new Date());
	if (!(await authorizeAdmin())) return;
	bindForms();
	await loadAdminData();
});
