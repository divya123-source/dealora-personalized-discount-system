import { api, getToken, requireAuth, setButtonLoading, showToast } from "./api.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
	"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

function accountMessage(message, kind = "error") {
	const element = document.querySelector("#account-message");
	if (!element) return;
	element.textContent = message;
	element.className = message ? `form-message form-message--${kind}` : "form-message";
}

async function renderShopperInsight() {
	const panel = document.querySelector("#account-insight");
	if (!panel) return;
	try {
		const { customer_segment, price_sensitivity } = await api.recommendations(1);
		const segment = customer_segment?.segment || "general";
		const sensitivity = Number(price_sensitivity ?? 0.5);
		const segmentLabels = {
			general: "Curious explorer",
			value_1: "Value-first shopper",
			value_2: "Balanced shopper",
			value_3: "Premium-focused shopper",
			low_value: "Value-first shopper",
			high_value: "Premium-focused shopper",
		};
		const sensitivityLabel = sensitivity < 0.35 ? "Budget-conscious" : sensitivity < 0.7 ? "Balanced on price" : "Comfortable paying for quality";
		panel.innerHTML = `
			<div class="card-heading"><div><p class="eyebrow">Your shopper profile</p><h2>Dealora insight</h2></div><span class="card-heading__icon">02</span></div>
			<div class="profile-insight">
				<p><strong>${escapeHtml(segmentLabels[segment] || segmentLabels.general)}</strong></p>
				<p>${escapeHtml(sensitivityLabel)} with a ${escapeHtml((sensitivity * 100).toFixed(0))}% price sensitivity score.</p>
				<p class="profile-insight__note">Your picks are tuned to your browsing habits, preferred categories, and good-value moments.</p>
			</div>`;
	} catch (error) {
		panel.innerHTML = `
			<div class="card-heading"><div><p class="eyebrow">Your shopper profile</p><h2>Dealora insight</h2></div><span class="card-heading__icon">02</span></div>
			<div class="profile-insight"><p>Personalized suggestions are ready for you.</p><p class="profile-insight__note">Browse a few items and your account will learn your style.</p></div>`;
	}
}

async function loadProfile() {
	const form = document.querySelector("#profile-form");
	if (!form) return;
	const { user } = await api.me();
	form.elements.name.value = user.name || "";
	form.elements.email.value = user.email || "";
	form.elements.age.value = user.age ?? "";
	form.elements.location.value = user.location || "";
	const preferences = user.preferences;
	form.elements.preferences.value = Array.isArray(preferences)
		? preferences.join(", ")
		: Object.entries(preferences || {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join(", ");
	const heading = document.querySelector(".account-welcome h1");
	if (heading) heading.innerHTML = `A little space<br>that's <em>${escapeHtml(user.name.split(" ")[0])}'s.</em>`;
}

async function saveProfile(event) {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const button = form.querySelector("[type=submit]");
	const age = form.elements.age.value;
	const preferences = form.elements.preferences.value.split(",").map((item) => item.trim()).filter(Boolean);
	setButtonLoading(button, true, "Saving");
	accountMessage("");
	try {
		const result = await api.updateProfile({
			name: form.elements.name.value.trim(),
			age: age ? Number(age) : null,
			location: form.elements.location.value.trim(),
			preferences,
		});
		const stored = JSON.parse(sessionStorage.getItem("dealora_user") || "{}");
		sessionStorage.setItem("dealora_user", JSON.stringify({ ...stored, ...result.user }));
		accountMessage("Your details are saved. Your edit will keep getting better.", "success");
		window.dispatchEvent(new CustomEvent("dealora:session", { detail: result.user }));
	} catch (error) { accountMessage(error.message); }
	finally { setButtonLoading(button, false); }
}

async function loadOrders() {
	const body = document.querySelector("#orders-body");
	if (!body) return;
	try {
		const { orders } = await api.orders();
		body.innerHTML = orders.length ? orders.map((order) => `<tr><td><strong>#${order.id}</strong></td><td>${new Date(order.created_at).toLocaleDateString()}</td><td>${money(order.total_amount)}</td><td class="saved-amount">−${money(order.discount_amount)}</td><td><strong>${money(order.final_amount)}</strong></td><td><span class="status-pill status-pill--${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></td></tr>`).join("") : `<tr><td colspan="6"><div class="table-empty"><span>No orders just yet.</span><a href="products.html">Find your first good deal ↗</a></div></td></tr>`;
	} catch (error) { body.innerHTML = `<tr><td colspan="6" class="table-error">${escapeHtml(error.message)}</td></tr>`; }
}

async function loadAccountNotifications() {
	const list = document.querySelector("#account-notifications");
	if (!list) return;
	try {
		const { notifications } = await api.notifications();
		list.innerHTML = notifications.length ? notifications.map((item) => `<article class="account-notification ${item.is_read ? "is-read" : ""}"><span class="account-notification__dot"></span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p><time>${new Date(item.created_at).toLocaleString()}</time></div>${item.is_read ? `<span class="read-label">Read</span>` : `<button class="text-button" type="button" data-account-read="${item.id}">Mark read</button>`}</article>`).join("") : `<div class="empty-copy">Your updates will find a home here.</div>`;
	} catch (error) { list.innerHTML = `<p class="inline-error">${escapeHtml(error.message)}</p>`; }
}

document.addEventListener("DOMContentLoaded", async () => {
	if (!document.querySelector("#profile-form")) return;
	if (!requireAuth()) return;
	document.querySelector("#profile-form").addEventListener("submit", saveProfile);
	document.querySelector("[data-account-read-all]")?.addEventListener("click", async (event) => {
		const button = event.currentTarget;
		setButtonLoading(button, true, "Updating");
		try {
			await api.markAllNotificationsRead();
			await loadAccountNotifications();
			showToast("All notifications marked as read.", "success");
		} catch (error) { showToast(error.message, "error"); }
		finally { setButtonLoading(button, false); }
	});
	document.querySelector("#account-notifications")?.addEventListener("click", async (event) => {
		const button = event.target.closest("[data-account-read]");
		if (!button) return;
		try {
			await api.markNotificationRead(button.dataset.accountRead);
			await loadAccountNotifications();
		} catch (error) { showToast(error.message, "error"); }
	});
	try { await Promise.all([loadProfile(), renderShopperInsight(), loadOrders(), loadAccountNotifications()]); }
	catch (error) { accountMessage(error.message); }
});
