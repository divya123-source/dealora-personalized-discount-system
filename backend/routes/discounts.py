from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import CartItem, Discount, db


discounts_bp = Blueprint("discounts", __name__, url_prefix="/api/discounts")


def qualifying_cart_lines(discount, cart_items):
	lines = []
	for item in cart_items:
		product = item.product
		if discount.product_id and product.id != discount.product_id:
			continue
		if discount.category_id and product.category_id != discount.category_id:
			continue
		lines.append(item)
	return lines


def calculate_discount_amount(discount, eligible_subtotal):
	if discount.discount_type.lower() in {"percentage", "percent"}:
		amount = eligible_subtotal * float(discount.discount_value) / 100
	elif discount.discount_type.lower() in {"fixed", "fixed_amount", "amount"}:
		amount = float(discount.discount_value)
	else:
		return None
	return round(min(max(amount, 0), eligible_subtotal), 2)


@discounts_bp.get("")
def list_discounts():
	now = datetime.utcnow()
	discounts = Discount.query.order_by(Discount.expiry_date.asc()).all()
	available = [discount.to_dict() for discount in discounts if discount.is_available(now)]
	return jsonify({"discounts": available, "count": len(available)})


@discounts_bp.get("/<int:discount_id>")
def get_discount(discount_id):
	discount = db.session.get(Discount, discount_id)
	if discount is None or not discount.is_available():
		return jsonify({"error": "Discount not found or no longer available."}), 404
	return jsonify({"discount": discount.to_dict()})


@discounts_bp.post("/<int:discount_id>/redeem")
@jwt_required()
def redeem_discount(discount_id):
	user_id = int(get_jwt_identity())
	discount = db.session.get(Discount, discount_id)
	if discount is None or not discount.is_available():
		return jsonify({"error": "Discount is inactive, not started, or expired."}), 400
	if discount.discount_type.lower() not in {"percentage", "percent", "fixed", "fixed_amount", "amount"}:
		return jsonify({"error": "This discount has an unsupported discount type."}), 400

	cart_items = CartItem.query.filter_by(user_id=user_id).all()
	eligible_lines = qualifying_cart_lines(discount, cart_items)
	eligible_subtotal = sum(float(item.product.price) * item.quantity for item in eligible_lines)
	if eligible_subtotal < float(discount.minimum_purchase):
		return jsonify({
			"error": "The qualifying items do not meet the minimum purchase.",
			"minimum_purchase": float(discount.minimum_purchase),
			"eligible_subtotal": round(eligible_subtotal, 2),
		}), 400
	amount = calculate_discount_amount(discount, eligible_subtotal)
	if amount is None:
		return jsonify({"error": "This discount has an unsupported discount type."}), 400
	return jsonify({
		"message": "Discount is valid for this cart and will be recorded at checkout.",
		"discount": discount.to_dict(),
		"eligible_subtotal": round(eligible_subtotal, 2),
		"discount_amount": amount,
	})
