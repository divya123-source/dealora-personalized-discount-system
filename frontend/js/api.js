// Change this value when the Flask API is hosted on another port or host.
export const API_BASE = window.DEALORA_API_BASE || "http://127.0.0.1:5001/api";

const TOKEN_KEY = "dealora_token";
const USER_KEY = "dealora_user";

export class ApiError extends Error {
	constructor(message, status = 0, payload = null) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.payload = payload;
	}
}

export function getToken() {
	return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
	try {
		return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
	} catch {
		sessionStorage.removeItem(USER_KEY);
		return null;
	}
}

export function saveSession({ token, user }) {
	if (token) sessionStorage.setItem(TOKEN_KEY, token);
	if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
	window.dispatchEvent(new CustomEvent("dealora:session", { detail: user || null }));
}

export function clearSession() {
	sessionStorage.removeItem(TOKEN_KEY);
	sessionStorage.removeItem(USER_KEY);
	window.dispatchEvent(new CustomEvent("dealora:session", { detail: null }));
}

function friendlyMessage(status, message) {
	if (status === 400) return message || "Please check the information and try again.";
	if (status === 401) return message || "Please sign in to continue.";
	if (status === 403) return message || "You do not have permission to do that.";
	if (status === 404) return message || "We could not find what you were looking for.";
	if (status >= 500) return "The Dealora service is having trouble. Please try again shortly.";
	return message || "Something went wrong. Please try again.";
}

function redirectToLogin() {
	const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const next = encodeURIComponent(here);
	window.location.assign(`login.html?next=${next}`);
}

export async function request(path, options = {}) {
	const { method = "GET", body, headers = {}, auth = true } = options;
	const token = auth ? getToken() : null;
	const requestHeaders = { Accept: "application/json", ...headers };
	if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
	if (token) requestHeaders.Authorization = `Bearer ${token}`;

	let response;
	try {
		response = await fetch(`${API_BASE}${path}`, {
			method,
			headers: requestHeaders,
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiError("Could not reach Dealora. Check that the Flask backend is running.");
	}

	let payload = null;
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		payload = await response.json();
	} else if (!response.ok) {
		payload = { error: response.statusText };
	}

	if (response.status === 401 && token) {
		clearSession();
		if (!window.location.pathname.endsWith("/login.html")) redirectToLogin();
	}
	if (!response.ok) {
		throw new ApiError(friendlyMessage(response.status, payload?.error || payload?.message), response.status, payload);
	}
	return payload;
}

export function setButtonLoading(button, loading, label = "Working") {
	if (!button) return;
	if (loading) {
		if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent.trim();
		button.disabled = true;
		button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${label}`;
	} else {
		button.disabled = false;
		if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
	}
}

export function showToast(message, kind = "info") {
	let region = document.querySelector("#toast-region");
	if (!region) {
		region = document.createElement("div");
		region.id = "toast-region";
		region.className = "toast-region";
		region.setAttribute("aria-live", "polite");
		document.body.append(region);
	}
	const toast = document.createElement("div");
	toast.className = `toast toast--${kind}`;
	toast.textContent = message;
	region.append(toast);
	window.setTimeout(() => toast.remove(), 4200);
}

export function requireAuth() {
	if (getToken()) return true;
	redirectToLogin();
	return false;
}

export const api = {
	health: () => request("/health", { auth: false }),
	register: (body) => request("/auth/register", { method: "POST", body, auth: false }),
	login: (body) => request("/auth/login", { method: "POST", body, auth: false }),
	me: () => request("/auth/me"),
	updateProfile: (body) => request("/auth/profile", { method: "PUT", body }),
	products: (query = "") => request(`/products${query ? `?${query}` : ""}`, { auth: false }),
	product: (id) => request(`/products/${id}`, { auth: false }),
	recordActivity: (id, activityType = "view") => request(`/products/${id}/activity`, {
		method: "POST", body: { activity_type: activityType },
	}),
	categories: () => request("/categories", { auth: false }),
	discounts: () => request("/discounts", { auth: false }),
	discount: (id) => request(`/discounts/${id}`, { auth: false }),
	redeemDiscount: (id) => request(`/discounts/${id}/redeem`, { method: "POST", body: {} }),
	recommendations: (limit = 8) => request(`/recommendations?limit=${limit}`),
	cart: () => request("/cart"),
	addToCart: (productId, quantity = 1) => request("/cart", {
		method: "POST", body: { product_id: productId, quantity },
	}),
	updateCartItem: (productId, quantity) => request(`/cart/${productId}`, {
		method: "PUT", body: { quantity },
	}),
	removeCartItem: (productId) => request(`/cart/${productId}`, { method: "DELETE" }),
	checkout: (body = {}) => request("/orders/checkout", { method: "POST", body }),
	orders: () => request("/orders"),
	wishlist: () => request("/wishlist"),
	addToWishlist: (productId) => request(`/wishlist/${productId}`, { method: "POST", body: {} }),
	removeFromWishlist: (productId) => request(`/wishlist/${productId}`, { method: "DELETE" }),
	notifications: () => request("/notifications"),
	markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PUT", body: {} }),
	markAllNotificationsRead: () => request("/notifications/read-all", { method: "PUT", body: {} }),
	adminDashboard: () => request("/admin/dashboard"),
	adminUsers: () => request("/admin/users"),
	adminProducts: () => request("/admin/products"),
	createProduct: (body) => request("/admin/products", { method: "POST", body }),
	updateProduct: (id, body) => request(`/admin/products/${id}`, { method: "PUT", body }),
	deleteProduct: (id) => request(`/admin/products/${id}`, { method: "DELETE" }),
	adminDiscounts: () => request("/admin/discounts"),
	createDiscount: (body) => request("/admin/discounts", { method: "POST", body }),
	updateDiscount: (id, body) => request(`/admin/discounts/${id}`, { method: "PUT", body }),
	deleteDiscount: (id) => request(`/admin/discounts/${id}`, { method: "DELETE" }),
	adminOrders: () => request("/admin/orders"),
	adminRedemptions: () => request("/admin/redemptions"),
};
