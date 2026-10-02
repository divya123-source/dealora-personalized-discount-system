import { api, clearSession, getStoredUser, getToken, saveSession, setButtonLoading, showToast } from "./api.js";

function escapeHtml(value = "") {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
	})[character]);
}

function nextAfterLogin(user) {
	const params = new URLSearchParams(window.location.search);
	const next = params.get("next");
	const allowedPages = new Set([
		"index.html", "login.html", "register.html", "products.html",
		"cart.html", "account.html", "admin.html",
	]);
	if (next && next.startsWith("/") && !next.startsWith("//")) {
		const target = new URL(next, window.location.origin);
		const page = target.pathname.split("/").pop();
		if (target.origin === window.location.origin && allowedPages.has(page)) {
			return `${page}${target.search}${target.hash}`;
		}
	}
	return user.role === "admin" ? "admin.html" : "account.html";
}

async function loadNotifications() {
	const panel = document.querySelector("#notification-panel");
	if (!panel) return;
	try {
		const { notifications } = await api.notifications();
		const unread = notifications.filter((item) => !item.is_read).length;
		const badge = document.querySelector("[data-notification-count]");
		if (badge) {
			badge.textContent = unread > 9 ? "9+" : String(unread);
			badge.hidden = unread === 0;
		}
		panel.innerHTML = `
			<div class="notification-panel__head">
				<strong>Notifications</strong>
				<button class="text-button" type="button" data-mark-all-read ${unread ? "" : "disabled"}>Mark all read</button>
			</div>
			${notifications.length ? notifications.slice(0, 8).map((item) => `
				<article class="notification-item ${item.is_read ? "is-read" : ""}">
					<div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p>
						<time>${new Date(item.created_at).toLocaleDateString()}</time></div>
					${item.is_read ? "" : `<button class="icon-button" type="button" data-mark-read="${item.id}" aria-label="Mark as read">✓</button>`}
				</article>`).join("") : `<p class="empty-copy">You're all caught up.</p>`}
			<a class="notification-panel__link" href="account.html#orders">View your account</a>`;
	} catch (error) {
		if (error.status !== 401) showToast(error.message, "error");
	}
}

async function refreshHeaderCounts() {
	if (!getToken()) return;
	try {
		const { cart } = await api.cart();
		const cartBadge = document.querySelector("[data-cart-count]");
		if (cartBadge) {
			cartBadge.textContent = cart.item_count > 99 ? "99+" : String(cart.item_count);
			cartBadge.hidden = cart.item_count === 0;
		}
	} catch (error) {
		if (error.status !== 401) console.warn(error.message);
	}
	await loadNotifications();
}

function initializeDisplayToggle() {
	const buttons = [...document.querySelectorAll("[data-display-toggle]")];
	if (!buttons.length) return;

	const updateState = () => {
		const isMaximized = Boolean(document.fullscreenElement);
		buttons.forEach((button) => {
			const label = button.querySelector("[data-display-label]");
			const action = isMaximized ? "Restore page" : "Maximize page";
			if (label) label.textContent = isMaximized ? "Restore" : "Maximize";
			button.setAttribute("aria-label", action);
			button.setAttribute("title", action);
			button.setAttribute("aria-pressed", String(isMaximized));
		});
	};

	buttons.forEach((button) => button.addEventListener("click", async () => {
		if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== "function") {
			showToast("Fullscreen is not available in this browser context.", "error");
			return;
		}
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
		} catch {
			showToast("Your browser did not allow fullscreen. Use its own window controls instead.", "error");
		}
	}));
	document.addEventListener("fullscreenchange", updateState);
	updateState();
}

function initializeNavigation() {
	const loginLinks = document.querySelector("[data-login-links]");
	const userLinks = document.querySelector("[data-user-links]");
	const storedUser = getStoredUser();
	const loggedIn = Boolean(getToken() && storedUser);
	if (loginLinks) loginLinks.hidden = loggedIn;
	if (userLinks) userLinks.hidden = !loggedIn;
	const name = document.querySelector("[data-user-name]");
	if (name) name.textContent = loggedIn ? storedUser.name.split(" ")[0] : "Account";
	const adminLink = document.querySelector("[data-admin-link]");
	if (adminLink) adminLink.hidden = !loggedIn || storedUser.role !== "admin";
	if (loggedIn) refreshHeaderCounts();

	document.querySelector("[data-logout]")?.addEventListener("click", () => {
		clearSession();
		window.location.assign("index.html");
	});

	const menuButton = document.querySelector("#mobile-menu-toggle");
	const nav = document.querySelector("#site-nav");
	menuButton?.addEventListener("click", () => {
		const open = nav?.classList.toggle("is-open");
		menuButton.setAttribute("aria-expanded", String(Boolean(open)));
	});
	nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
		nav.classList.remove("is-open");
		menuButton?.setAttribute("aria-expanded", "false");
	}));

	const notificationButton = document.querySelector("[data-notification-toggle]");
	const panel = document.querySelector("#notification-panel");
	notificationButton?.addEventListener("click", async () => {
		if (!getToken()) {
			window.location.assign("login.html");
			return;
		}
		panel?.classList.toggle("is-open");
		if (panel?.classList.contains("is-open")) await loadNotifications();
	});
	panel?.addEventListener("click", async (event) => {
		const markButton = event.target.closest("[data-mark-read]");
		const markAllButton = event.target.closest("[data-mark-all-read]");
		try {
			if (markButton) await api.markNotificationRead(markButton.dataset.markRead);
			if (markAllButton) await api.markAllNotificationsRead();
			if (markButton || markAllButton) await refreshHeaderCounts();
		} catch (error) {
			showToast(error.message, "error");
		}
	});
	document.addEventListener("click", (event) => {
		if (!event.target.closest(".notification-wrap")) panel?.classList.remove("is-open");
	});
}

function initializeLoginForm() {
	const form = document.querySelector("#login-form");
	if (!form) return;
	const errorBox = document.querySelector("#form-message");
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		errorBox.textContent = "";
		if (!form.reportValidity()) return;
		const button = form.querySelector("[type=submit]");
		setButtonLoading(button, true, "Signing in");
		try {
			const result = await api.login({
				email: form.elements.email.value.trim(),
				password: form.elements.password.value,
			});
			saveSession(result);
			window.location.assign(nextAfterLogin(result.user));
		} catch (error) {
			errorBox.textContent = error.message;
			errorBox.className = "form-message form-message--error";
		} finally {
			setButtonLoading(button, false);
		}
	});
}

function initializeRegisterForm() {
	const form = document.querySelector("#register-form");
	if (!form) return;
	const message = document.querySelector("#form-message");
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		message.textContent = "";
		if (!form.reportValidity()) return;
		const password = form.elements.password.value;
		if (password !== form.elements.confirm_password.value) {
			message.textContent = "Those passwords do not match.";
			message.className = "form-message form-message--error";
			form.elements.confirm_password.focus();
			return;
		}
		const button = form.querySelector("[type=submit]");
		setButtonLoading(button, true, "Creating account");
		try {
			await api.register({
				name: form.elements.name.value.trim(),
				email: form.elements.email.value.trim(),
				password,
			});
			message.textContent = "Your account is ready. Sign in to start exploring.";
			message.className = "form-message form-message--success";
			form.reset();
			window.setTimeout(() => window.location.assign("login.html"), 1200);
		} catch (error) {
			message.textContent = error.message;
			message.className = "form-message form-message--error";
		} finally {
			setButtonLoading(button, false);
		}
	});
}

async function validateSavedSession() {
	if (!getToken()) return;
	try {
		const { user } = await api.me();
		saveSession({ token: getToken(), user });
		const name = document.querySelector("[data-user-name]");
		if (name) name.textContent = user.name.split(" ")[0];
		const adminLink = document.querySelector("[data-admin-link]");
		if (adminLink) adminLink.hidden = user.role !== "admin";
	} catch (error) {
		if (error.status !== 401) console.warn(error.message);
	}
}

document.addEventListener("DOMContentLoaded", () => {
	initializeDisplayToggle();
	initializeNavigation();
	initializeLoginForm();
	initializeRegisterForm();
	validateSavedSession();
});
