import frappe
from frappe.utils import cint, flt


@frappe.whitelist()
def get_item_group_children(parent_group):
    children = frappe.get_all(
        "Item Group",
        filters={"parent_item_group": parent_group},
        fields=["name"],
        order_by="name asc"
    )
    return [c.name for c in children]


@frappe.whitelist()
def get_template_attributes(template_name):
    items = frappe.get_all(
        "Item",
        filters={
            "item_code": template_name,
            "has_variants": 1,
            "disabled": 0
        },
        fields=["name", "item_code"]
    )

    if not items:
        return None

    item_doc = frappe.get_doc("Item", items[0].name)
    attributes = []

    for attr_row in item_doc.attributes:
        attr_name = attr_row.attribute
        if not attr_name:
            continue

        try:
            attr_doc = frappe.get_doc("Item Attribute", attr_name)
        except frappe.DoesNotExistError:
            continue

        attr_values = []

        if cint(attr_doc.numeric_values):
            current = flt(attr_doc.from_range)
            to_range = flt(attr_doc.to_range)
            increment = flt(attr_doc.increment) or 1

            while current <= to_range:
                attr_values.append(str(round(current, 4)))
                current += increment
        else:
            attr_values = [
                d.attribute_value
                for d in sorted(attr_doc.item_attribute_values, key=lambda x: x.idx)
                if d.attribute_value
            ]

        attributes.append({
            "attribute": attr_name,
            "fieldname": frappe.scrub(attr_name),
            "label": attr_name,
            "values": attr_values
        })

    return {
        "item_code": item_doc.item_code,
        "attributes": attributes
    }


@frappe.whitelist()
def find_item_variant(template_item_code, attributes):
    attributes = frappe.parse_json(attributes) if attributes else {}

    variants = frappe.get_all(
        "Item",
        filters={
            "variant_of": template_item_code,
            "disabled": 0
        },
        fields=["name", "item_code", "item_name"]
    )

    for variant in variants:
        item_doc = frappe.get_doc("Item", variant.name)
        item_attrs = {
            d.attribute: d.attribute_value
            for d in item_doc.attributes
        }

        if all(str(item_attrs.get(k)) == str(v) for k, v in attributes.items()):
            return {
                "item_code": item_doc.item_code,
                "item_name": item_doc.item_name
            }

    return None
