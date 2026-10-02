from collections import defaultdict

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


def segment_customers(users, orders=None, activities=None, max_clusters=3):
	"""Group customers using order frequency, spending, average order, and activity."""
	users = list(users)
	if not users:
		return {}
	orders_by_user = defaultdict(list)
	for order in orders or []:
		orders_by_user[order.user_id].append(order)
	activity_counts = defaultdict(int)
	for activity in activities or []:
		activity_counts[activity.user_id] += 1

	features = {}
	rows = []
	for user in users:
		user_orders = orders_by_user[user.id]
		total_spending = sum(float(order.final_amount) for order in user_orders)
		average_order = total_spending / len(user_orders) if user_orders else 0.0
		row = [len(user_orders), total_spending, average_order, activity_counts[user.id]]
		features[user.id] = {
			"purchase_frequency": len(user_orders),
			"total_spending": round(total_spending, 2),
			"average_order_value": round(average_order, 2),
			"activity_count": activity_counts[user.id],
		}
		rows.append(row)

	unique_rows = np.unique(np.asarray(rows, dtype=float), axis=0)
	if len(users) < 2 or len(unique_rows) < 2:
		for user in users:
			features[user.id]["segment"] = "general"
		return features

	cluster_count = max(2, min(int(max_clusters), len(users), len(unique_rows)))
	scaled_rows = StandardScaler().fit_transform(np.asarray(rows, dtype=float))
	model = KMeans(n_clusters=cluster_count, random_state=42, n_init=10)
	labels = model.fit_predict(scaled_rows)
	spending_by_cluster = defaultdict(list)
	for user, label in zip(users, labels):
		spending_by_cluster[int(label)].append(features[user.id]["total_spending"])
	ordered_clusters = sorted(
		spending_by_cluster,
		key=lambda label: (sum(spending_by_cluster[label]) / len(spending_by_cluster[label]), label),
	)
	segment_names = {label: "value_{}".format(index + 1) for index, label in enumerate(ordered_clusters)}
	for user, label in zip(users, labels):
		features[user.id]["segment"] = segment_names[int(label)]
	return features
