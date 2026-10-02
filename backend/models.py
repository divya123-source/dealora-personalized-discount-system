from datetime import datetime

from flask_jwt_extended import JWTManager
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.security import check_password_hash, generate_password_hash


db = SQLAlchemy()
jwt = JWTManager()


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(connection, _connection_record):
	if connection.__class__.__module__ == "sqlite3":
		cursor = connection.cursor()
		cursor.execute("PRAGMA foreign_keys=ON")
		cursor.close()


class User(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(120), nullable=False)
	email = db.Column(db.String(255), unique=True, nullable=False, index=True)
	password_hash = db.Column(db.String(255), nullable=False)
	role = db.Column(db.String(20), nullable=False, default="customer")
	age = db.Column(db.Integer)
	location = db.Column(db.String(120))
	preferences = db.Column(db.JSON, nullable=False, default=list)
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	cart_items = db.relationship("CartItem", back_populates="user", cascade="all, delete-orphan")
	wishlist_items = db.relationship("Wishlist", back_populates="user", cascade="all, delete-orphan")
	orders = db.relationship("Order", back_populates="user", cascade="all, delete-orphan")
	redemptions = db.relationship("Redemption", back_populates="user", cascade="all, delete-orphan")
	notifications = db.relationship("Notification", back_populates="user", cascade="all, delete-orphan")
	activities = db.relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")

	def set_password(self, password):
		self.password_hash = generate_password_hash(password, method="pbkdf2:sha256:600000")

	def check_password(self, password):
		return check_password_hash(self.password_hash, password)

	def to_dict(self):
		return {
			"id": self.id,
			"name": self.name,
			"email": self.email,
			"role": self.role,
			"age": self.age,
			"location": self.location,
			"preferences": self.preferences or [],
			"created_at": self.created_at.isoformat() if self.created_at else None,
		}


class Category(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(100), unique=True, nullable=False)
	description = db.Column(db.Text)

	products = db.relationship("Product", back_populates="category")
	discounts = db.relationship("Discount", back_populates="category")

	def to_dict(self):
		return {"id": self.id, "name": self.name, "description": self.description}


class Product(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(180), nullable=False, index=True)
	description = db.Column(db.Text, nullable=False, default="")
	category_id = db.Column(db.Integer, db.ForeignKey("category.id"), nullable=False, index=True)
	price = db.Column(db.Float, nullable=False)
	stock = db.Column(db.Integer, nullable=False, default=0)
	image_url = db.Column(db.String(500))
	brand = db.Column(db.String(120))
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	category = db.relationship("Category", back_populates="products")
	cart_items = db.relationship("CartItem", back_populates="product", cascade="all, delete-orphan")
	wishlist_items = db.relationship("Wishlist", back_populates="product", cascade="all, delete-orphan")
	order_items = db.relationship("OrderItem", back_populates="product")
	activities = db.relationship("UserActivity", back_populates="product", cascade="all, delete-orphan")
	discounts = db.relationship("Discount", back_populates="product")

	def to_dict(self, include_category=True):
		data = {
			"id": self.id,
			"name": self.name,
			"description": self.description,
			"category_id": self.category_id,
			"price": round(float(self.price), 2),
			"stock": self.stock,
			"image_url": self.image_url,
			"brand": self.brand,
			"created_at": self.created_at.isoformat() if self.created_at else None,
		}
		if include_category:
			data["category"] = self.category.to_dict() if self.category else None
		return data


class Discount(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	title = db.Column(db.String(180), nullable=False)
	description = db.Column(db.Text, nullable=False, default="")
	discount_type = db.Column(db.String(20), nullable=False)
	discount_value = db.Column(db.Float, nullable=False)
	coupon_code = db.Column(db.String(80), unique=True, index=True)
	start_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	expiry_date = db.Column(db.DateTime, nullable=False)
	minimum_purchase = db.Column(db.Float, nullable=False, default=0)
	category_id = db.Column(db.Integer, db.ForeignKey("category.id"))
	product_id = db.Column(db.Integer, db.ForeignKey("product.id"))
	is_active = db.Column(db.Boolean, nullable=False, default=True)

	category = db.relationship("Category", back_populates="discounts")
	product = db.relationship("Product", back_populates="discounts")
	redemptions = db.relationship("Redemption", back_populates="discount")

	def is_available(self, now=None):
		now = now or datetime.utcnow()
		return self.is_active and self.start_date <= now <= self.expiry_date

	def to_dict(self):
		return {
			"id": self.id,
			"title": self.title,
			"description": self.description,
			"discount_type": self.discount_type,
			"discount_value": float(self.discount_value),
			"coupon_code": self.coupon_code,
			"start_date": self.start_date.isoformat() if self.start_date else None,
			"expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
			"minimum_purchase": float(self.minimum_purchase),
			"category_id": self.category_id,
			"product_id": self.product_id,
			"is_active": self.is_active,
		}


class Wishlist(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False, index=True)
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	__table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),)

	user = db.relationship("User", back_populates="wishlist_items")
	product = db.relationship("Product", back_populates="wishlist_items")


class CartItem(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False, index=True)
	quantity = db.Column(db.Integer, nullable=False, default=1)
	__table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),)

	user = db.relationship("User", back_populates="cart_items")
	product = db.relationship("Product", back_populates="cart_items")


class Order(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	total_amount = db.Column(db.Float, nullable=False)
	discount_amount = db.Column(db.Float, nullable=False, default=0)
	final_amount = db.Column(db.Float, nullable=False)
	status = db.Column(db.String(30), nullable=False, default="placed")
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	user = db.relationship("User", back_populates="orders")
	items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
	redemptions = db.relationship("Redemption", back_populates="order")

	def to_dict(self):
		return {
			"id": self.id,
			"user_id": self.user_id,
			"total_amount": round(float(self.total_amount), 2),
			"discount_amount": round(float(self.discount_amount), 2),
			"final_amount": round(float(self.final_amount), 2),
			"status": self.status,
			"created_at": self.created_at.isoformat() if self.created_at else None,
			"items": [item.to_dict() for item in self.items],
		}


class OrderItem(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False, index=True)
	product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False)
	quantity = db.Column(db.Integer, nullable=False)
	price = db.Column(db.Float, nullable=False)

	order = db.relationship("Order", back_populates="items")
	product = db.relationship("Product", back_populates="order_items")

	def to_dict(self):
		return {
			"product_id": self.product_id,
			"product_name": self.product.name if self.product else None,
			"quantity": self.quantity,
			"price": round(float(self.price), 2),
			"line_total": round(float(self.price) * self.quantity, 2),
		}


class Redemption(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	discount_id = db.Column(db.Integer, db.ForeignKey("discount.id"), nullable=False)
	order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False)
	redeemed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	user = db.relationship("User", back_populates="redemptions")
	discount = db.relationship("Discount", back_populates="redemptions")
	order = db.relationship("Order", back_populates="redemptions")


class Notification(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	title = db.Column(db.String(180), nullable=False)
	message = db.Column(db.Text, nullable=False)
	is_read = db.Column(db.Boolean, nullable=False, default=False)
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	user = db.relationship("User", back_populates="notifications")

	def to_dict(self):
		return {
			"id": self.id,
			"title": self.title,
			"message": self.message,
			"is_read": self.is_read,
			"created_at": self.created_at.isoformat() if self.created_at else None,
		}


class UserActivity(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
	product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False, index=True)
	activity_type = db.Column(db.String(30), nullable=False, default="view")
	created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

	user = db.relationship("User", back_populates="activities")
	product = db.relationship("Product", back_populates="activities")
