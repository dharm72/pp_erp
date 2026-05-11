frappe.ui.form.on('Purchase Order Item', {
	add_item_code: function(frm, cdt, cdn) {
		open_material_dialog(frm, cdt, cdn);
	}
});

function open_material_dialog(frm, cdt, cdn) {
	const dialog = new frappe.ui.Dialog({
		title: 'Select Raw Material',
		size: 'small',
		fields: [
			{
				fieldname: 'material_type',
				fieldtype: 'Select',
				label: 'Raw Material Type',
				options: '',
				reqd: 1,
				onchange: function() {
					on_material_type_change(dialog);
				}
			},
			{
				fieldname: 'template_item',
				fieldtype: 'Select',
				label: 'Raw Material',
				options: '',
				hidden: 1,
				reqd: 0,
				onchange: function() {
					on_template_change(dialog);
				}
			},
			{
				fieldname: 'attr_section',
				fieldtype: 'Section Break',
				label: 'Attributes',
				hidden: 1
			},
			{
				fieldname: 'attr_1',
				fieldtype: 'Select',
				label: 'Attribute 1',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'attr_2',
				fieldtype: 'Select',
				label: 'Attribute 2',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'attr_3',
				fieldtype: 'Select',
				label: 'Attribute 3',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'attr_4',
				fieldtype: 'Select',
				label: 'Attribute 4',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'attr_5',
				fieldtype: 'Select',
				label: 'Attribute 5',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'attr_6',
				fieldtype: 'Select',
				label: 'Attribute 6',
				options: '',
				hidden: 1
			},
			{
				fieldname: 'found_item_code',
				fieldtype: 'Data',
				label: 'Found Item Code',
				read_only: 1,
				hidden: 1
			}
		],
		primary_action_label: 'Search Item',
		primary_action: function() {
			on_search(dialog);
		}
	});

	dialog._frm = frm;
	dialog._cdt = cdt;
	dialog._cdn = cdn;
	dialog._current_attrs = [];
	dialog._matched_item = null;

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_item_group_children',
		args: { parent_group: 'Raw Material' },
		callback: function(r) {
			const types = r.message || [];
			dialog.set_df_property('material_type', 'options', '\n' + types.join('\n'));
			refresh_dialog_field(dialog, 'material_type');
		}
	});

	dialog.show();
}

function refresh_dialog_field(dialog, fieldname) {
	if (
		dialog.fields_dict &&
		dialog.fields_dict[fieldname] &&
		typeof dialog.fields_dict[fieldname].refresh === 'function'
	) {
		dialog.fields_dict[fieldname].refresh();
	}
}

function on_material_type_change(dialog) {
	const material_type = dialog.get_value('material_type');

	reset_template_and_attributes(dialog);

	if (!material_type) return;

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_item_group_children',
		args: { parent_group: material_type },
		freeze: true,
		freeze_message: __('Loading...'),
		callback: function(r) {
			const children = r.message || [];

			if (!children.length) {
				frappe.msgprint(__('No items found under {0}', [material_type]));
				return;
			}

			dialog.set_df_property('template_item', 'options', '\n' + children.join('\n'));
			dialog.set_df_property('template_item', 'hidden', 0);
			dialog.set_df_property('template_item', 'reqd', 1);
			refresh_dialog_field(dialog, 'template_item');
		}
	});
}

function on_template_change(dialog) {
	const template = dialog.get_value('template_item');

	hide_all_attribute_fields(dialog);

	dialog.set_df_property('found_item_code', 'hidden', 1);
	dialog.set_value('found_item_code', '');
	refresh_dialog_field(dialog, 'found_item_code');

	dialog.set_primary_action(__('Search Item'), function() {
		on_search(dialog);
	});

	if (!template) return;

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_template_attributes',
		args: { template_name: template },
		freeze: true,
		freeze_message: __('Loading attributes...'),
		callback: function(r) {
			if (!r.message) {
				frappe.msgprint(__('No Item Template found with name "{0}". Make sure an Item Template with that exact name exists.', [template]));
				return;
			}

			const attrs = r.message.attributes || [];
			dialog._current_attrs = attrs;

			if (!attrs.length) {
				frappe.msgprint(__('No attributes defined in template {0}', [template]));
				return;
			}

			dialog.set_df_property('attr_section', 'hidden', 0);
			refresh_dialog_field(dialog, 'attr_section');

			attrs.forEach((attr, index) => {
				const fieldname = `attr_${index + 1}`;

				if (!dialog.fields_dict[fieldname]) return;

				dialog.set_df_property(fieldname, 'label', attr.label || attr.attribute);
				dialog.set_df_property(fieldname, 'options', '\n' + (attr.values || []).join('\n'));
				dialog.set_df_property(fieldname, 'hidden', 0);
				dialog.set_df_property(fieldname, 'reqd', 1);
				dialog.set_value(fieldname, '');

				refresh_dialog_field(dialog, fieldname);
			});
		}
	});
}

function on_search(dialog) {
	const material_type = dialog.get_value('material_type');
	const template = dialog.get_value('template_item');

	if (!material_type) {
		frappe.msgprint(__('Please select Raw Material Type.'));
		return;
	}

	if (!template) {
		frappe.msgprint(__('Please select Raw Material.'));
		return;
	}

	const attributes = {};

	for (let i = 0; i < dialog._current_attrs.length; i++) {
		const attr = dialog._current_attrs[i];
		const fieldname = `attr_${i + 1}`;
		const value = dialog.get_value(fieldname);

		if (!value) {
			frappe.msgprint(__('Please fill all attribute fields.'));
			return;
		}

		attributes[attr.attribute] = value;
	}

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.find_item_variant',
		args: {
			template_item_code: template,
			attributes: attributes
		},
		freeze: true,
		freeze_message: __('Searching item variant...'),
		callback: function(r) {
			if (!r.message) {
				dialog._matched_item = null;
				dialog.set_df_property('found_item_code', 'hidden', 1);
				dialog.set_value('found_item_code', '');
				refresh_dialog_field(dialog, 'found_item_code');
				frappe.msgprint(__('No matching variant found.'));
				return;
			}

			const matched = r.message;
			dialog._matched_item = matched;

			dialog.set_df_property('found_item_code', 'hidden', 0);
			dialog.set_value('found_item_code', matched.item_code);
			refresh_dialog_field(dialog, 'found_item_code');

			dialog.set_primary_action(__('Add to Purchase Order'), function() {
				frappe.model.set_value(dialog._cdt, dialog._cdn, 'item_code', matched.item_code);
				frappe.show_alert({
					message: __('{0} added to Purchase Order', [matched.item_code]),
					indicator: 'green'
				}, 4);
				dialog.hide();
			});
		}
	});
}

function reset_template_and_attributes(dialog) {
	dialog._matched_item = null;

	dialog.set_value('template_item', '');
	dialog.set_df_property('template_item', 'hidden', 1);
	dialog.set_df_property('template_item', 'reqd', 0);
	dialog.set_df_property('template_item', 'options', '');
	refresh_dialog_field(dialog, 'template_item');

	hide_all_attribute_fields(dialog);

	dialog.set_df_property('found_item_code', 'hidden', 1);
	dialog.set_value('found_item_code', '');
	refresh_dialog_field(dialog, 'found_item_code');

	dialog.set_primary_action(__('Search Item'), function() {
		on_search(dialog);
	});
}

function hide_all_attribute_fields(dialog) {
	dialog._current_attrs = [];

	dialog.set_df_property('attr_section', 'hidden', 1);
	refresh_dialog_field(dialog, 'attr_section');

	for (let i = 1; i <= 6; i++) {
		const fieldname = `attr_${i}`;

		if (!dialog.fields_dict[fieldname]) continue;

		dialog.set_value(fieldname, '');
		dialog.set_df_property(fieldname, 'hidden', 1);
		dialog.set_df_property(fieldname, 'reqd', 0);
		dialog.set_df_property(fieldname, 'label', `Attribute ${i}`);
		dialog.set_df_property(fieldname, 'options', '');
		refresh_dialog_field(dialog, fieldname);
	}
}
