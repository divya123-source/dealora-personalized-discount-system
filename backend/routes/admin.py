from datetime import datetime
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from models import (
	CartItem,
	Category,
	Discount,
	Order,
	Product,
	Redemption,
	User,
	UserActivity,
	Wishlist,
	db,
)


admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def admin_required(function):
	@wraps(function)
	@jwt_required()
	def wrapped(*args, **kwargs):
		try:
			user_id = int(get_jwt_identity())
		except (TypeError, ValueError):
			return jsonify({"error": "A valid admin token is required."}), 401
		user = db.session.get(User, user_id)
		if user is None or user.role != "admin":
			return jsonify({"error": "Admin access required."}), 403
		return function(*args, **kwargs)
	return wrapped


def parse_datetime(value, field_name):
	if not value:
		raise ValueError("{} is required.".format(field_name))
	try:
		parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
	except ValueError as error:
		raise ValueError("{} must be an ISO-8601 date or datetime.".format(field_name)) from error
	if parsed.tzinfo is not None:
		parsed = parsed.astimezone().replace(tzinfo=None)
	return parsed


def validate_product_data(data, product=None):
	name = str(data.get("name", product.name if product else "")).strip()
	if not name:
		raise ValueError("Product name is required.")
	try:
		price = float(data.get("price", product.price if product else None))
		stock = int(data.get("stock", product.stock if product else 0))
		category_id = int(data.get("category_id", product.category_id if product else None))
	except (TypeError, ValueError):
		raise ValueError("Price, stock, and category_id must be valid numbers.")
	if price < 0 or stock < 0:
		raise ValueError("Price and stock cannot be negative.")
	if db.session.get(Category, category_id) is None:
		raise ValueError("The selected category does not exist.")
	return {
		"name": name,
		"description": str(data.get("description", product.description if product else "")),
		"category_id": category_id,
		"price": price,
		"stock": stock,
		"image_url": data.get("image_url", product.image_url if product else None),
		"brand": data.get("brand", product.brand if product else None),
	}


def validate_discount_data(data, discount=None):
	title = str(data.get("title", discount.title if discount else "")).strip()
	if not title:
		raise ValueError("Discount title is required.")
	discount_type = str(data.get("discount_type", discount.discount_type if discount else "")).lower()
	aliases = {"percent": "percentage", "fixed_amount": "fixed"}
	discount_type = aliases.get(discount_type, discount_type)
	if discount_type not in {"percentage", "fixed"}:
		raise ValueError("discount_type must be 'percentage' or 'fixed'.")
	try:
		discount_value = float(data.get("discount_value", discount.discount_value if discount else None))
		minimum_purchase = float(data.get(
			"minimum_purchase", discount.minimum_purchase if discount else 0
		))
	except (TypeError, ValueError):
		raise ValueError("Discount value and minimum purchase must be numbers.")
	if discount_value <= 0 or (discount_type == "percentage" and discount_value > 100):
		raise ValueError("Discount value must be positive; percentages cannot exceed 100.")
	if minimum_purchase < 0:
		raise ValueError("Minimum purchase cannot be negative.")

	start_value = data.get("start_date")
	expiry_value = data.get("expiry_date")
	start_date = parse_datetime(start_value, "start_date") if start_value else (
		discount.start_date if discount else datetime.utcnow()
	)
	expiry_date = parse_datetime(expiry_value, "expiry_date") if expiry_value else (
		discount.expiry_date if discount else None
	)
	if expiry_date is None:
		raise ValueError("expiry_date is required.")
	if expiry_date < start_date:
		raise ValueError("expiry_date must be after start_date.")

	category_id = data.get("category_id", discount.category_id if discount else None)
	product_id = data.get("product_id", discount.product_id if discount else None)
	try:
		category_id = int(category_id) if category_id not in (None, "") else None
		product_id = int(product_id) if product_id not in (None, "") else None
	except (TypeError, ValueError):
		raise ValueError("category_id and product_id must be whole numbers.")
	if category_id is not None and db.session.get(Category, category_id) is None:
		raise ValueError("The selected category does not exist.")
	if product_id is not None and db.session.get(Product, product_id) is None:
		raise ValueError("The selected product does not exist.")
	active_value = data.get("is_active", discount.is_active if discount else True)
	if not isinstance(active_value, bool):
		raise ValueError("is_active must be a boolean.")
	return {
		"title": title,
		"description": str(data.get("description", discount.description if discount else "")),
		"discount_type": discount_type,
		"discount_value": discount_value,
		"coupon_code": str(data.get("coupon_code", discount.coupon_code if discount else "")).strip().upper() or None,
		"start_date": start_date,
		"expiry_date": expiry_date,
		"minimum_purchase": minimum_purchase,
		"category_id": category_id,
		"product_id": product_id,
		"is_active": active_value,
	}


@admin_bp.get("/dashboard")
@admin_required
def dashboard():
	return jsonify({
		"users": User.query.count(),
		"customers": User.query.filter_by(role="customer").count(),
		"products": Product.query.count(),
		"categories": Category.query.count(),
		"active_discounts": Discount.query.filter_by(is_active=True).count(),
		"orders": Order.query.count(),
		"revenue": round(sum(float(order.final_amount) for order in Order.query.all()), 2),
		"redemptions": Redemption.query.count(),
	})


@admin_bp.get("/users")
@admin_required
def list_users():
	users = User.query.order_by(User.created_at.desc()).all()
	return jsonify({"users": [user.to_dict() for user in users]})


@admin_bp.get("/products")
@admin_required
def list_products():
	products = Product.query.order_by(Product.id.asc()).all()
	return jsonify({"products": [product.to_dict() for product in products]})


@admin_bp.post("/products")
@admin_required
def create_product():
	data = request.get_json(silent=True) or {}
	try:
		product = Product(**validate_product_data(data))
	except ValueError as error:
		return jsonify({"error": str(error)}), 400
	db.session.add(product)
	db.session.commit()
	return jsonify({"product": product.to_dict()}), 201


@admin_bp.put("/products/<int:product_id>")
@admin_required
def update_product(product_id):
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	try:
		for key, value in validate_product_data(request.get_json(silent=True) or {}, product).items():
			setattr(product, key, value)
	except ValueError as error:
		return jsonify({"error": str(error)}), 400
	db.session.commit()
	return jsonify({"product": product.to_dict()})


@admin_bp.delete("/products/<int:product_id>")
@admin_required
def delete_product(product_id):
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	if product.order_items:
		return jsonify({"error": "Products in order history cannot be deleted."}), 409
	Discount.query.filter_by(product_id=product_id).update({"product_id": None})
	CartItem.query.filter_by(product_id=product_id).delete()
	Wishlist.query.filter_by(product_id=product_id).delete()
	UserActivity.query.filter_by(product_id=product_id).delete()
	db.session.delete(product)
	db.session.commit()
	return jsonify({"message": "Product deleted."})


@admin_bp.get("/discounts")
@admin_required
def list_discounts():
	discounts = Discount.query.order_by(Discount.expiry_date.asc()).all()
	return jsonify({"discounts": [discount.to_dict() for discount in discounts]})


@admin_bp.post("/discounts")
@admin_required
def create_discount():
	try:
		discount = Discount(**validate_discount_data(request.get_json(silent=True) or {}))
	except ValueError as error:
		return jsonify({"error": str(error)}), 400
	db.session.add(discount)
	try:
		db.session.commit()
	except Exception:
		db.session.rollback()
		return jsonify({"error": "Coupon code must be unique."}), 409
	return jsonify({"discount": discount.to_dict()}), 201


@admin_bp.put("/discounts/<int:discount_id>")
@admin_required
def update_discount(discount_id):
	discount = db.session.get(Discount, discount_id)
	if discount is None:
		return jsonify({"error": "Discount not found."}), 404
	try:
		values = validate_discount_data(request.get_json(silent=True) or {}, discount)
	except ValueError as error:
		return jsonify({"error": str(error)}), 400
	for key, value in values.items():
		setattr(discount, key, value)
	try:
		db.session.commit()
	except Exception:
		db.session.rollback()
		return jsonify({"error": "Coupon code must be unique."}), 409
	return jsonify({"discount": discount.to_dict()})


@admin_bp.delete("/discounts/<int:discount_id>")
@admin_required
def delete_discount(discount_id):
	discount = db.session.get(Discount, discount_id)
	if discount is None:
		return jsonify({"error": "Discount not found."}), 404
	if discount.redemptions:
		return jsonify({"error": "Discounts with redemption history cannot be deleted."}), 409
	db.session.delete(discount)
	db.session.commit()
	return jsonify({"message": "Discount deleted."})


@admin_bp.get("/orders")
@admin_required
def list_orders():
	orders = Order.query.order_by(Order.created_at.desc()).all()
	return jsonify({"orders": [order.to_dict() for order in orders]})


@admin_bp.get("/redemptions")
@admin_required
def list_redemptions():
	records = Redemption.query.order_by(Redemption.redeemed_at.desc()).all()
	return jsonify({"redemptions": [
		{
			"id": record.id,
			"user_id": record.user_id,
			"discount_id": record.discount_id,
			"discount_title": record.discount.title,
			"order_id": record.order_id,
			"redeemed_at": record.redeemed_at.isoformat(),
		}
		for record in records
	]})
