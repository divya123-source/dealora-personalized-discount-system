import os
from datetime import datetime, timedelta

from app import create_app
from models import (
	Category,
	Discount,
	Notification,
	Order,
	OrderItem,
	Product,
	User,
	UserActivity,
	db,
)


CATEGORY_DATA = [
	("Electronics", "Useful technology and everyday devices."),
	("Fashion", "Clothing, footwear, and accessories."),
	("Home", "Comfortable and practical products for the home."),
	("Beauty", "Personal care, skincare, and beauty essentials."),
	("Sports", "Equipment and accessories for active lifestyles."),
]

PRODUCT_DATA = [
	("AeroSound Wireless Headphones", "Noise-isolating over-ear headphones with 40-hour battery life.", "Electronics", 129.99, 38, "AeroSound", "photo-1505740420928-5e560c06d30e"),
	("PixelPro 4K Monitor", "27-inch color-accurate display with USB-C connectivity.", "Electronics", 349.00, 16, "ViewPoint", "photo-1527443224154-c4a3942d3acf"),
	("NovaFit Smartwatch", "Fitness tracking, heart-rate monitoring, and GPS.", "Electronics", 189.50, 27, "NovaFit", "photo-1523275335684-37898b6baf30"),
	("Orbit Bluetooth Speaker", "Portable waterproof speaker with room-filling sound.", "Electronics", 79.95, 44, "Orbit Audio", "photo-1608043152269-423dbba4e7e1"),
	("Lumen Desk Lamp", "Dimmable LED lamp with wireless charging base.", "Home", 54.00, 32, "Lumen", "photo-1507473885765-e6ed057f782c"),
	("CloudWeave Throw Blanket", "Soft recycled-cotton throw for sofa or bedroom.", "Home", 42.00, 61, "CloudWeave", "photo-1600210492486-724fe5c67fb0"),
	("BrewCraft Pour-Over Set", "Ceramic dripper and glass carafe for slow coffee.", "Home", 68.00, 24, "BrewCraft", "photo-1495474472287-4d71bcdd2085"),
	("Terra Ceramic Planter", "Hand-finished planter with a clean, modern profile.", "Home", 34.50, 53, "Terra", "photo-1485955900006-10f4d324d411"),
	("Everyday Canvas Tote", "Durable cotton carryall with reinforced handles.", "Fashion", 28.00, 72, "Common Thread", "photo-1544816155-12df9643f363"),
	("Harbor Knit Sweater", "Midweight cotton knit with a relaxed everyday fit.", "Fashion", 84.00, 29, "Harbor & Field", "photo-1576566588028-4147f3842f27"),
	("Stride Running Shoes", "Lightweight road-running shoes with cushioned support.", "Fashion", 112.00, 21, "Stride", "photo-1542291026-7eec264c27ff"),
	("Arc Minimalist Backpack", "Weather-resistant 20-liter backpack with laptop sleeve.", "Fashion", 96.00, 34, "Arc Goods", "photo-1553062407-98eeb64c6a62"),
	("Citrus Glow Serum", "Vitamin C facial serum for a bright, balanced routine.", "Beauty", 38.00, 47, "Kindred Skin", "photo-1608248543803-ba4f8c70ae0b"),
	("Daily Hydration Cream", "Fragrance-free moisturizer for everyday use.", "Beauty", 31.50, 58, "Kindred Skin", "photo-1556229010-6c3f2c9ca5f8"),
	("Botanical Bath Set", "Three botanical bath soaks made with mineral salts.", "Beauty", 29.00, 36, "Stillwater", "photo-1608571423902-eed4a5ad8108"),
	("Sculpt Yoga Mat", "Grippy, cushioned mat made for studio and home practice.", "Sports", 74.00, 25, "Form Studio", "photo-1592432678016-e910b452f9a2"),
	("Trail Flask 750ml", "Insulated stainless-steel bottle for long days outdoors.", "Sports", 36.00, 64, "Northline", "photo-1602143407151-7111542de6e8"),
	("Peak Resistance Bands", "Five resistance levels with a compact carry pouch.", "Sports", 24.00, 52, "Peak Motion", "photo-1598289431512-b97b0917affc"),
	("Summit Daypack", "Lightweight hiking pack with ventilated back panel.", "Sports", 88.00, 19, "Northline", "photo-1551632811-561732d1e306"),
	("Linen Table Runner", "Washed linen runner sized for everyday dining.", "Home", 45.00, 31, "Hearthline", "photo-1600210492486-724fe5c67fb0"),
]

DEMO_USERS = [
	("Dealora Admin", "admin@dealora.com", "DEALORA_DEMO_ADMIN_PASSWORD", "admin", 35, "Seattle", ["Electronics", "Home"]),
	("Jordan Lee", "user@dealora.com", "DEALORA_DEMO_CUSTOMER_PASSWORD", "customer", 29, "Portland", ["Fashion", "Sports"]),
	("Maya Patel", "maya@dealora.com", "DEALORA_DEMO_MAYA_PASSWORD", "customer", 34, "Austin", ["Beauty", "Home"]),
	("Ethan Brooks", "ethan@dealora.com", "DEALORA_DEMO_ETHAN_PASSWORD", "customer", 26, "Denver", ["Electronics", "Sports"]),
	("Sofia Chen", "sofia@dealora.com", "DEALORA_DEMO_SOFIA_PASSWORD", "customer", 41, "Chicago", ["Home", "Beauty"]),
]


def seed_database():
	app = create_app()
	with app.app_context():
		missing_passwords = [
			password_env
			for _, email, password_env, *_ in DEMO_USERS
			if User.query.filter_by(email=email).first() is None
			and len(os.environ.get(password_env, "")) < 12
		]
		if missing_passwords:
			raise RuntimeError(
				"Set unique demo passwords of at least 12 characters for: {}".format(
				", ".join(missing_passwords)
				)
			)

		categories = {}
		for name, description in CATEGORY_DATA:
			category = Category.query.filter_by(name=name).first()
			if category is None:
				category = Category(name=name, description=description)
				db.session.add(category)
			categories[name] = category
		db.session.flush()

		products = {}
		for name, description, category_name, price, stock, brand, image_id in PRODUCT_DATA:
			product = Product.query.filter_by(name=name).first()
			if product is None:
				product = Product(
					name=name,
					description=description,
					category_id=categories[category_name].id,
					price=price,
					stock=stock,
					brand=brand,
					image_url="https://images.unsplash.com/{}?auto=format&fit=crop&w=900&q=80".format(image_id),
				)
				db.session.add(product)
			products[name] = product
		db.session.flush()

		users = {}
		for name, email, password_env, role, age, location, preferences in DEMO_USERS:
			user = User.query.filter_by(email=email).first()
			if user is None:
				user = User(name=name, email=email)
				user.set_password(os.environ[password_env])
				db.session.add(user)
			user.name = name
			user.role = role
			user.age = age
			user.location = location
			user.preferences = preferences
			users[email] = user
		db.session.flush()

		now = datetime.utcnow()
		discount_data = [
			("Weekend Tech Edit", "Save on selected electronics.", "percentage", 15, "TECH15", 100, "Electronics", None, 14),
			("Home Refresh", "A little saving for a more comfortable home.", "percentage", 12, "HOME12", 75, "Home", None, 30),
			("First Style Find", "A fixed saving on the Harbor knit.", "fixed", 18, "STYLE18", 60, None, "Harbor Knit Sweater", 21),
			("Beauty Routine Bonus", "Save on your skincare routine.", "percentage", 20, "GLOW20", 45, "Beauty", None, 45),
			("Move More", "A fixed amount off selected sports gear.", "fixed", 10, "MOVE10", 40, "Sports", None, 60),
			("Sound Upgrade", "Save on AeroSound headphones.", "percentage", 10, "AERO10", 120, None, "AeroSound Wireless Headphones", 90),
			("Everyday Essentials", "A small saving on orders over $50.", "fixed", 7, "DEALORA7", 50, None, None, 120),
			("Seasonal Home Event", "A limited-time home collection offer.", "percentage", 18, "NEST18", 150, "Home", None, 180),
		]
		for title, description, kind, value, code, minimum, category_name, product_name, days in discount_data:
			if Discount.query.filter_by(coupon_code=code).first():
				continue
			discount = Discount(
				title=title,
				description=description,
				discount_type=kind,
				discount_value=value,
				coupon_code=code,
				start_date=now - timedelta(days=2),
				expiry_date=now + timedelta(days=days),
				minimum_purchase=minimum,
				category_id=categories[category_name].id if category_name else None,
				product_id=products[product_name].id if product_name else None,
				is_active=True,
			)
			db.session.add(discount)
		db.session.flush()

		browsing = {
			"user@dealora.com": [
				("Stride Running Shoes", "view"), ("Stride Running Shoes", "cart"),
				("Trail Flask 750ml", "view"), ("Summit Daypack", "click"),
				("Arc Minimalist Backpack", "wishlist"), ("Harbor Knit Sweater", "view"),
			],
			"maya@dealora.com": [
				("Citrus Glow Serum", "view"), ("Citrus Glow Serum", "cart"),
				("Daily Hydration Cream", "purchase"), ("CloudWeave Throw Blanket", "view"),
				("Terra Ceramic Planter", "wishlist"),
			],
			"ethan@dealora.com": [
				("AeroSound Wireless Headphones", "view"), ("AeroSound Wireless Headphones", "cart"),
				("NovaFit Smartwatch", "purchase"), ("Orbit Bluetooth Speaker", "view"),
				("Peak Resistance Bands", "click"), ("Sculpt Yoga Mat", "view"),
			],
			"sofia@dealora.com": [
				("BrewCraft Pour-Over Set", "view"), ("BrewCraft Pour-Over Set", "purchase"),
				("Linen Table Runner", "cart"), ("Lumen Desk Lamp", "wishlist"),
				("Botanical Bath Set", "view"),
			],
		}
		for email, events in browsing.items():
			user = users[email]
			for product_name, activity_type in events:
				product = products[product_name]
				exists = UserActivity.query.filter_by(
					user_id=user.id, product_id=product.id, activity_type=activity_type
				).first()
				if exists is None:
					db.session.add(UserActivity(
						user_id=user.id,
						product_id=product.id,
						activity_type=activity_type,
						created_at=now - timedelta(days=(len(events) % 6) + 1),
					))

		if Order.query.count() == 0:
			purchase_data = [
				("user@dealora.com", 18, [("Stride Running Shoes", 1), ("Trail Flask 750ml", 1)]),
				("user@dealora.com", 54, [("Arc Minimalist Backpack", 1)]),
				("maya@dealora.com", 12, [("Citrus Glow Serum", 2), ("Daily Hydration Cream", 1)]),
				("maya@dealora.com", 39, [("Botanical Bath Set", 1), ("CloudWeave Throw Blanket", 1)]),
				("ethan@dealora.com", 23, [("NovaFit Smartwatch", 1)]),
				("sofia@dealora.com", 31, [("BrewCraft Pour-Over Set", 1), ("Terra Ceramic Planter", 1)]),
			]
			for email, days_ago, lines in purchase_data:
				order_items = [(products[name], quantity) for name, quantity in lines]
				total = round(sum(product.price * quantity for product, quantity in order_items), 2)
				order = Order(
					user_id=users[email].id,
					total_amount=total,
					discount_amount=0,
					final_amount=total,
					status="fulfilled",
					created_at=now - timedelta(days=days_ago),
				)
				db.session.add(order)
				db.session.flush()
				for product, quantity in order_items:
					db.session.add(OrderItem(
						order_id=order.id,
						product_id=product.id,
						quantity=quantity,
						price=product.price,
					))
					db.session.add(UserActivity(
						user_id=users[email].id,
						product_id=product.id,
						activity_type="purchase",
						created_at=order.created_at,
					))
		db.session.commit()
		print("Dealora demo data is ready.")
		print("Demo admin email: admin@dealora.com")
		print("Demo customer email: user@dealora.com")
		print("Demo passwords are supplied through environment variables.")


if __name__ == "__main__":
	seed_database()
