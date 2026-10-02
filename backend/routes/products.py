from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func

from models import CartItem, Category, Product, UserActivity, Wishlist, db


products_bp = Blueprint("products", __name__, url_prefix="/api")


@products_bp.get("/products")
def list_products():
	query = Product.query.join(Category)
	search = request.args.get("search", "").strip()
	category = request.args.get("category", "").strip()
	minimum = request.args.get("min_price", type=float)
	maximum = request.args.get("max_price", type=float)
	sort = request.args.get("sort", "name")

	if search:
		pattern = "%{}%".format(search)
		query = query.filter(
			db.or_(Product.name.ilike(pattern), Product.description.ilike(pattern), Product.brand.ilike(pattern))
		)
	if category:
		if category.isdigit():
			query = query.filter(Product.category_id == int(category))
		else:
			query = query.filter(Category.name.ilike(category))
	if minimum is not None:
		query = query.filter(Product.price >= minimum)
	if maximum is not None:
		query = query.filter(Product.price <= maximum)

	if sort == "price_asc":
		query = query.order_by(Product.price.asc(), Product.id.asc())
	elif sort == "price_desc":
		query = query.order_by(Product.price.desc(), Product.id.asc())
	elif sort == "newest":
		query = query.order_by(Product.created_at.desc(), Product.id.desc())
	elif sort == "popular":
		query = (
			query.outerjoin(UserActivity, UserActivity.product_id == Product.id)
			.group_by(Product.id)
			.order_by(func.count(UserActivity.id).desc(), Product.id.asc())
		)
	else:
		query = query.order_by(Product.name.asc())

	products = query.all()
	return jsonify({"products": [product.to_dict() for product in products], "count": len(products)})


@products_bp.get("/products/<int:product_id>")
def get_product(product_id):
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	return jsonify({"product": product.to_dict()})


@products_bp.post("/products/<int:product_id>/activity")
@jwt_required()
def record_activity(product_id):
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	user_id = int(get_jwt_identity())
	activity_type = str((request.get_json(silent=True) or {}).get("activity_type", "view")).lower()
	if activity_type not in {"view", "click", "cart", "purchase", "wishlist"}:
		return jsonify({"error": "Unsupported activity type."}), 400
	db.session.add(UserActivity(user_id=user_id, product_id=product.id, activity_type=activity_type))
	db.session.commit()
	return jsonify({"message": "Activity recorded."}), 201


@products_bp.get("/categories")
def list_categories():
	categories = Category.query.order_by(Category.name.asc()).all()
	return jsonify({"categories": [category.to_dict() for category in categories]})


@products_bp.get("/wishlist")
@jwt_required()
def get_wishlist():
	user_id = int(get_jwt_identity())
	entries = Wishlist.query.filter_by(user_id=user_id).order_by(Wishlist.created_at.desc()).all()
	return jsonify({"wishlist": [entry.product.to_dict() for entry in entries]})


@products_bp.post("/wishlist/<int:product_id>")
@jwt_required()
def add_to_wishlist(product_id):
	user_id = int(get_jwt_identity())
	product = db.session.get(Product, product_id)
	if product is None:
		return jsonify({"error": "Product not found."}), 404
	entry = Wishlist.query.filter_by(user_id=user_id, product_id=product_id).first()
	if entry is None:
		entry = Wishlist(user_id=user_id, product_id=product_id)
		db.session.add(entry)
		db.session.add(UserActivity(user_id=user_id, product_id=product_id, activity_type="wishlist"))
		db.session.commit()
	return jsonify({"message": "Product is in your wishlist.", "product": product.to_dict()}), 201


@products_bp.delete("/wishlist/<int:product_id>")
@jwt_required()
def remove_from_wishlist(product_id):
	user_id = int(get_jwt_identity())
	entry = Wishlist.query.filter_by(user_id=user_id, product_id=product_id).first()
	if entry is None:
		return jsonify({"error": "Wishlist item not found."}), 404
	db.session.delete(entry)
	db.session.commit()
	return jsonify({"message": "Product removed from wishlist."})
