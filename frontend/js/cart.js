import { api, getToken, requireAuth, setButtonLoading, showToast } from "./api.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
	"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

let latestCart = { items: [], subtotal: 0, item_count: 0 };

function setMessage(message = "", kind = "error") {
	const element = document.querySelector("#cart-message");
	if (!element) return;
	element.textContent = message;
	element.className = message ? `form-message form-message--${kind}` : "form-message";
}

function renderCart(cart) {
	latestCart = cart;
	const itemsNode = document.querySelector("#cart-items");
	const summaryNode = document.querySelector("#cart-summary");
	const countNode = document.querySelector("#cart-line-count");
	const badge = document.querySelector("[data-cart-count]");
	if (countNode) countNode.textContent = String(cart.items.length);
	if (badge) {
		badge.textContent = cart.item_count > 99 ? "99+" : String(cart.item_count);
		badge.hidden = cart.item_count === 0;
	}
	if (!cart.items.length) {
		itemsNode.innerHTML = `<div class="empty-state cart-empty"><span class="empty-state__symbol">✳</span><h2>Your cart has room for a good find.</h2><p>Take another look through the edit. Something will feel just right.</p><a class="button button--dark" href="products.html">Explore products <span>↗</span></a></div>`;
		summaryNode.innerHTML = `<div class="checkout-panel__head"><p class="eyebrow">A little summary</p><h2>Order total</h2></div><div class="summary-line"><span>Subtotal</span><strong>${money(0)}</strong></div><div class="summary-line summary-line--total"><span>Total</span><strong>${money(0)}</strong></div><button class="button button--dark button--wide" type="button" disabled>Checkout</button><p class="checkout-note">Your order details will appear here.</p>`;
		return;
	}

	itemsNode.innerHTML = cart.items.map(({ product, quantity, line_total }) => `<article class="cart-item" data-cart-row="${product.id}">
		<a class="cart-item__image" href="products.html?product=${product.id}"><img src="${escapeHtml(product.image_url || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80")}" alt="${escapeHtml(product.name)}" loading="lazy"></a>
		<div class="cart-item__details"><span class="eyebrow">${escapeHtml(product.category?.name || "Dealora find")}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.brand || "")}</p><div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}"><button type="button" data-quantity="-1" data-product-id="${product.id}" aria-label="Decrease quantity" ${quantity <= 1 ? "disabled" : ""}>−</button><span>${quantity}</span><button type="button" data-quantity="1" data-product-id="${product.id}" aria-label="Increase quantity" ${quantity >= product.stock ? "disabled" : ""}>+</button></div></div>
		<div class="cart-item__price"><strong>${money(line_total)}</strong><small>${money(product.price)} each</small><button class="text-button text-button--quiet" type="button" data-remove-item="${product.id}">Remove</button></div>
	</article>`).join("");

	summaryNode.innerHTML = `<div class="checkout-panel__head"><p class="eyebrow">A little summary</p><h2>Order total</h2></div><div class="summary-line"><span>Subtotal <small>${cart.item_count} item${cart.item_count === 1 ? "" : "s"}</small></span><strong>${money(cart.subtotal)}</strong></div><div class="summary-line"><span>Shipping</span><strong class="summary-included">Calculated at checkout</strong></div><form id="coupon-form" class="coupon-form"><label for="coupon-input">Have a coupon?</label><div><input id="coupon-input" name="coupon_code" type="text" maxlength="80" placeholder="Enter your code"><button type="submit" aria-label="Check coupon">Apply</button></div><p id="coupon-feedback" aria-live="polite"></p></form><div class="summary-line summary-line--total"><span>Estimated total</span><strong id="estimated-total">${money(cart.subtotal)}</strong></div><button class="button button--dark button--wide" id="checkout-button" type="button">Continue to checkout <span aria-hidden="true">↗</span></button><p class="checkout-note">Your selected discount will be checked before your order is placed. Secure checkout, no surprises.</p>`;
	summaryNode.querySelector("#coupon-form")?.addEventListener("submit", applyCoupon);
	summaryNode.querySelector("#checkout-button")?.addEventListener("click", checkout);
}

async function loadCart() {
	if (!document.querySelector("#cart-items")) return;
	if (!requireAuth()) return;
	try {
		const { cart } = await api.cart();
		renderCart(cart);
	} catch (error) {
		setMessage(error.message);
		document.querySelector("#cart-items").innerHTML = `<div class="empty-state empty-state--error"><h2>Your cart didn't load.</h2><p>${escapeHtml(error.message)}</p><button class="button button--dark" type="button" data-reload-cart>Try again</button></div>`;
	}
}

async function changeQuantity(productId, delta) {
	const current = latestCart.items.find((item) => item.product.id === Number(productId));
	if (!current) return;
	const quantity = current.quantity + Number(delta);
	if (quantity < 1) return;
	try {
		const { cart } = await api.updateCartItem(productId, quantity);
		renderCart(cart);
	} catch (error) { setMessage(error.message); }
}

async function removeItem(productId) {
	try {
		const { cart } = await api.removeCartItem(productId);
		renderCart(cart);
		setMessage("Removed from your cart.", "success");
	} catch (error) { setMessage(error.message); }
}

async function applyCoupon(event) {
	event.preventDefault();
	const form = event.currentTarget;
	const code = form.elements.coupon_code.value.trim();
	const feedback = form.querySelector("#coupon-feedback");
	if (!code) {
		feedback.textContent = "Enter a coupon code to check it.";
		feedback.className = "coupon-feedback coupon-feedback--error";
		return;
	}
	const button = form.querySelector("button[type=submit]");
	setButtonLoading(button, true, "Checking");
	try {
		const { discounts } = await api.discounts();
		const discount = discounts.find((item) => item.coupon_code?.toLowerCase() === code.toLowerCase());
		if (!discount) throw new Error("That code is not active. Check the spelling or browse today's offers.");
		const result = await api.redeemDiscount(discount.id);
		feedback.textContent = `${money(result.discount_amount)} off eligible items. Estimated total: ${money(Math.max(latestCart.subtotal - result.discount_amount, 0))}.`;
		feedback.className = "coupon-feedback coupon-feedback--success";
		form.dataset.discountId = String(discount.id);
		form.dataset.couponCode = code;
		const total = document.querySelector("#estimated-total");
		if (total) total.textContent = money(Math.max(latestCart.subtotal - result.discount_amount, 0));
	} catch (error) {
		feedback.textContent = error.message;
		feedback.className = "coupon-feedback coupon-feedback--error";
		delete form.dataset.discountId;
		delete form.dataset.couponCode;
		const total = document.querySelector("#estimated-total");
		if (total) total.textContent = money(latestCart.subtotal);
	} finally { setButtonLoading(button, false); }
}

async function checkout(event) {
	const button = event.currentTarget;
	const couponForm = document.querySelector("#coupon-form");
	const body = {};
	if (couponForm?.dataset.discountId) body.discount_id = Number(couponForm.dataset.discountId);
	setButtonLoading(button, true, "Placing order");
	setMessage("");
	try {
		const { order } = await api.checkout(body);
		renderCart({ items: [], subtotal: 0, item_count: 0 });
		const confirmation = document.querySelector("#order-confirmation");
		confirmation.hidden = false;
		confirmation.innerHTML = `<div class="confirmation-panel__icon">✓</div><p class="eyebrow">It's official</p><h2>Your good find is <em>on its way.</em></h2><p>Order <strong>#${order.id}</strong> has been placed. Thank you for shopping thoughtfully.</p><div class="confirmation-panel__totals"><span>You saved <strong>${money(order.discount_amount)}</strong></span><span>Order total <strong>${money(order.final_amount)}</strong></span></div><div class="confirmation-panel__actions"><a class="button button--dark" href="account.html#orders">View your order <span>↗</span></a><a class="button button--outline" href="products.html">Keep exploring</a></div>`;
		confirmation.scrollIntoView({ behavior: "smooth", block: "start" });
		showToast("Your order is confirmed.", "success");
	} catch (error) {
		setMessage(error.message);
		showToast(error.message, "error");
	} finally { setButtonLoading(button, false); }
}

document.addEventListener("DOMContentLoaded", () => {
	loadCart();
	document.querySelector("#cart-items")?.addEventListener("click", (event) => {
		const quantityButton = event.target.closest("[data-quantity]");
		const removeButton = event.target.closest("[data-remove-item]");
		if (quantityButton) changeQuantity(quantityButton.dataset.productId, quantityButton.dataset.quantity);
		if (removeButton) removeItem(removeButton.dataset.removeItem);
		if (event.target.closest("[data-reload-cart]")) loadCart();
	});
});
