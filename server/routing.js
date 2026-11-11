function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
}

export function firstMatchingCondition(conditions, { text = "", category = "", priority = "", products = [] } = {}) {
  const normalizedText = normalize(text);

  for (const condition of conditions) {
    const values = String(condition.trigger_value ?? "")
      .split(",")
      .map(normalize)
      .filter(Boolean);
    let matches = false;

    if (condition.trigger_type === "keyword") {
      matches = values.some((value) => normalizedText.includes(value));
    } else if (condition.trigger_type === "product") {
      const productNames = values.length ? values : products.map((product) => normalize(product.name));
      matches = productNames.some((name) => normalizedText.includes(name));
    } else if (condition.trigger_type === "category") {
      matches = values.some((value) => normalize(category) === value || normalizedText.includes(value));
    } else if (condition.trigger_type === "urgent") {
      matches = priority === "urgent" || /\b(urgent|critical|down|outage|blocking|emergency)\b/i.test(normalizedText);
    }

    if (matches) return condition;
  }

  return null;
}