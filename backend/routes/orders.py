from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import (
	CartItem,
	Discount,
	Notification,
	Order,
	OrderItem,
	Product,
	Redemption,
	UserActivity,
	db,
)
from routes.discounts import calculate_discount_amount, qualifying_cart_lines


orders_bp = Blueprint("orders", __name__, url_prefix="/api")


def serialize_cart(items):
	subtotal = sum(float(item.product.price) * item.quantity for item in items)
	return {
		"items": [
			{
				"product": item.product.to_dict(),
				"quantity": item.quantity,
				"line_total": round(float(item.product.price) * item.quantity, 2),
			}
			for item in items
		],
		"subtotal": round(subtotal, 2),
		"item_count": sum(item.quantity for item in items),
	}


@orders_bp.get("/cart")
@jwt_required()
def get_cart():
	user_id = int(get_jwt_identity())
	items = CartItem.query.filter_by(user_id=user_id).order_by(CartItem.id.asc()).all()
	return jsonify({"cart": serialize_cart(items)})


@orders_bp.post("/cart")
@jwt_required()
def add_to_cart():
	user_id = int(get_jwt_identity())
	data = request.get_json(silent=True) or {}
	try:
		product_id = int(data.get("product_id"))
		quantity = int(data.get("quantity", 1))
	except (TypeError, ValueError):
		return jsonify({"error": "product_id and quantity must be whole numbers."}), 400
	if quantity < 1:
		return jsonify({"error": "Quantity must be at least 1."}), 400
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	item = CartItem.query.filter_by(user_id=user_id, product_id=product_id).first()
	target_quantity = quantity + (item.quantity if item else 0)
	if target_quantity > product.stock:
		return jsonify({"error": "Requested quantity exceeds available stock.", "available_stock": product.stock}), 409
	if item:
		item.quantity = target_quantity
	else:
		db.session.add(CartItem(user_id=user_id, product_id=product_id, quantity=quantity))
	db.session.add(UserActivity(user_id=user_id, product_id=product_id, activity_type="cart"))
	db.session.commit()
	return jsonify({"message": "Cart updated.", "cart": serialize_cart(
		CartItem.query.filter_by(user_id=user_id).all()
	)}), 201


@orders_bp.put("/cart/<int:product_id>")
@jwt_required()
def update_cart_item(product_id):
	user_id = int(get_jwt_identity())
	data = request.get_json(silent=True) or {}
	try:
		quantity = int(data.get("quantity"))
	except (TypeError, ValueError):
		return jsonify({"error": "Quantity must be a whole number."}), 400
	if quantity < 1:
		return jsonify({"error": "Quantity must be at least 1. Use DELETE to remove an item."}), 400
	item = CartItem.query.filter_by(user_id=user_id, product_id=product_id).first()
	if item is None:
		return jsonify({"error": "Cart item not found."}), 404
	if quantity > item.product.stock:
		return jsonify({"error": "Requested quantity exceeds available stock.", "available_stock": item.product.stock}), 409
	item.quantity = quantity
	db.session.commit()
	return jsonify({"message": "Cart item updated.", "cart": serialize_cart(
		CartItem.query.filter_by(user_id=user_id).all()
	)})


@orders_bp.delete("/cart/<int:product_id>")
@jwt_required()
def remove_cart_item(product_id):
	user_id = int(get_jwt_identity())
	item = CartItem.query.filter_by(user_id=user_id, product_id=product_id).first()
	if item is None:
		return jsonify({"error": "Cart item not found."}), 404
	db.session.delete(item)
	db.session.commit()
	return jsonify({"message": "Cart item removed.", "cart": serialize_cart(
		CartItem.query.filter_by(user_id=user_id).all()
	)})


@orders_bp.post("/orders/checkout")
@jwt_required()
def checkout():
	user_id = int(get_jwt_identity())
	data = request.get_json(silent=True) or {}
	items = CartItem.query.filter_by(user_id=user_id).all()
	if not items:
		return jsonify({"error": "Your cart is empty."}), 400
	for item in items:
		if item.quantity > item.product.stock:
			return jsonify({
				"error": "Insufficient stock for {}.".format(item.product.name),
				"available_stock": item.product.stock,
			}), 409

	discount = None
	supplied_discount = data.get("discount_id")
	coupon_code = str(data.get("coupon_code", "")).strip()
	if supplied_discount is not None or coupon_code:
		if supplied_discount is not None:
			try:
				discount = db.session.get(Discount, int(supplied_discount))
			except (TypeError, ValueError):
				return jsonify({"error": "discount_id must be a whole number."}), 400
		else:
			discount = Discount.query.filter(Discount.coupon_code.ilike(coupon_code)).first()
		if discount is None or not discount.is_available():
			return jsonify({"error": "Discount is inactive, not started, expired, or unknown."}), 400
		if discount.discount_type.lower() not in {"percentage", "percent", "fixed", "fixed_amount", "amount"}:
			return jsonify({"error": "This discount has an unsupported discount type."}), 400

	subtotal = sum(float(item.product.price) * item.quantity for item in items)
	discount_amount = 0.0
	if discount:
		eligible_items = qualifying_cart_lines(discount, items)
		eligible_subtotal = sum(float(item.product.price) * item.quantity for item in eligible_items)
		if eligible_subtotal < float(discount.minimum_purchase):
			return jsonify({
				"error": "The qualifying items do not meet the discount minimum purchase.",
				"minimum_purchase": float(discount.minimum_purchase),
				"eligible_subtotal": round(eligible_subtotal, 2),
			}), 400
		discount_amount = calculate_discount_amount(discount, eligible_subtotal)
		if discount_amount is None:
			return jsonify({"error": "This discount has an unsupported discount type."}), 400

	order = Order(
		user_id=user_id,
		total_amount=round(subtotal, 2),
		discount_amount=discount_amount,
		final_amount=round(max(subtotal - discount_amount, 0), 2),
		status="placed",
	)
	try:
		db.session.add(order)
		db.session.flush()
		for item in items:
			product = item.product
			db.session.add(OrderItem(
				order_id=order.id,
				product_id=product.id,
				quantity=item.quantity,
				price=product.price,
			))
			product.stock -= item.quantity
			db.session.add(UserActivity(user_id=user_id, product_id=product.id, activity_type="purchase"))
		if discount:
			db.session.add(Redemption(user_id=user_id, discount_id=discount.id, order_id=order.id))
		db.session.add(Notification(
			user_id=user_id,
			title="Order placed",
			message="Your order #{} has been placed successfully.".format(order.id),
		))
		for item in items:
			db.session.delete(item)
		db.session.commit()
	except Exception:
		db.session.rollback()
		return jsonify({"error": "Checkout could not be completed. Please try again."}), 500

	return jsonify({"message": "Order placed successfully.", "order": order.to_dict()}), 201


@orders_bp.get("/orders")
@jwt_required()
def list_orders():
	user_id = int(get_jwt_identity())
	orders = Order.query.filter_by(user_id=user_id).order_by(Order.created_at.desc()).all()
	return jsonify({"orders": [order.to_dict() for order in orders]})


@orders_bp.get("/orders/<int:order_id>")
@jwt_required()
def get_order(order_id):
	user_id = int(get_jwt_identity())
	order = Order.query.filter_by(id=order_id, user_id=user_id).first()
	if order is None:
		return jsonify({"error": "Order not found."}), 404
	return jsonify({"order": order.to_dict()})
