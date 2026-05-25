frappe.ui.form.on('Purchase Order Item', {
	custom_add_item_code: function(frm, cdt, cdn) {
		open_material_dialog(frm, cdt, cdn);
	}
});

function open_material_dialog(frm, cdt, cdn) {
	const dialog = new frappe.ui.Dialog({
		title: 'Select Raw Material',
		size: 'large',
		fields: [
			{
				fieldname: 'main_html',
				fieldtype: 'HTML',
				options: '<div id="rm-dialog-root"></div>'
			}
		],
		primary_action_label: 'Add Item',
		primary_action: function() { on_add(dialog); }
	});

	if (!document.getElementById('rm-dialog-style')) {
		const style = document.createElement('style');
		style.id = 'rm-dialog-style';
		style.textContent = `
			#rm-dialog-root { font-size: 13px; }

			.rm-row {
				display: flex;
				align-items: flex-start;
				gap: 12px;
				padding: 8px 0;
				border-bottom: 1px solid var(--border-color);
			}
			.rm-row:last-child { border-bottom: none; }

			.rm-row-label {
				min-width: 110px;
				font-size: 11px;
				font-weight: 600;
				color: var(--text-muted);
				text-transform: uppercase;
				letter-spacing: 0.05em;
				padding-top: 5px;
				flex-shrink: 0;
			}

			.rm-pills {
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
			}

			.rm-pill {
				padding: 4px 14px;
				border-radius: 20px;
				border: 1px solid var(--border-color);
				background: var(--control-bg);
				color: var(--text-color);
				font-size: 12px;
				cursor: pointer;
				transition: all 0.12s ease;
				user-select: none;
				white-space: nowrap;
			}
			.rm-pill:hover {
				border-color: var(--primary);
				color: var(--primary);
			}
			.rm-pill.selected {
				background: var(--primary);
				border-color: var(--primary);
				color: #fff;
				font-weight: 500;
			}
			.rm-placeholder {
				font-size: 12px;
				color: var(--text-muted);
				font-style: italic;
				padding-top: 5px;
			}
		`;
		document.head.appendChild(style);
	}

	dialog._frm = frm;
	dialog._cdt = cdt;
	dialog._cdn = cdn;
	dialog._current_attrs = [];
	dialog._attr_values = {};
	dialog._selected = { type: null, material: null };

	dialog.show();
	setTimeout(() => init_dialog(dialog), 50);
}

function get_root(dialog) {
	return dialog.$wrapper.find('#rm-dialog-root');
}

function make_row(label, content_el) {
	const row = $('<div class="rm-row"></div>');
	row.append(`<div class="rm-row-label">${label}</div>`);
	row.append(content_el);
	return row;
}

function make_pills(values, selected, on_select) {
	const wrap = $('<div class="rm-pills"></div>');
	values.forEach(val => {
		const pill = $(`<div class="rm-pill">${val}</div>`);
		if (val === selected) pill.addClass('selected');
		pill.on('click', function() {
			wrap.find('.rm-pill').removeClass('selected');
			pill.addClass('selected');
			on_select(val);
		});
		wrap.append(pill);
	});
	return wrap;
}

function init_dialog(dialog) {
	const root = get_root(dialog);
	root.empty();

	// Type row — loading
	const typeContent = $('<div class="rm-placeholder">Loading...</div>');
	root.append(make_row('Type', typeContent));

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_item_group_children',
		args: { parent_group: 'Raw Material' },
		callback: function(r) {
			const types = r.message || [];
			const pills = make_pills(types, dialog._selected.type, function(val) {
				dialog._selected.type = val;
				dialog._selected.material = null;
				dialog._current_attrs = [];
				dialog._attr_values = {};
				// Remove material + attr rows, reload
				root.find('.rm-row').not(':first').remove();
				load_material_row(dialog, root, val);
			});
			typeContent.replaceWith(pills);
		}
	});
}

function load_material_row(dialog, root, material_type) {
	const content = $('<div class="rm-placeholder">Loading...</div>');
	const row = make_row('Material', content);
	row.attr('id', 'rm-row-material');
	root.append(row);

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_item_group_children',
		args: { parent_group: material_type },
		callback: function(r) {
			const children = r.message || [];
			if (!children.length) {
				content.text('No items found');
				return;
			}
			const pills = make_pills(children, dialog._selected.material, function(val) {
				dialog._selected.material = val;
				dialog._current_attrs = [];
				dialog._attr_values = {};
				// Remove attr rows, reload
				root.find('.rm-row[id^="rm-row-attr"]').remove();
				load_attr_rows(dialog, root, val);
			});
			content.replaceWith(pills);
		}
	});
}

function load_attr_rows(dialog, root, template) {
	// Show a single loading placeholder
	const loadingRow = $('<div class="rm-row" id="rm-row-attr-loading"><div class="rm-placeholder">Loading attributes...</div></div>');
	root.append(loadingRow);

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.get_template_attributes',
		args: { template_name: template },
		callback: function(r) {
			loadingRow.remove();

			if (!r.message) return;

			const attrs = r.message.attributes || [];
			dialog._current_attrs = attrs;

			attrs.forEach((attr, i) => {
				const attrName = attr.attribute;
				const label = attr.label || attrName;
				const values = attr.values || [];

				const pills = make_pills(values, null, function(val) {
					dialog._attr_values[attrName] = val;
				});

				const row = make_row(label, pills);
				row.attr('id', `rm-row-attr-${i}`);
				root.append(row);
			});
		}
	});
}

function on_add(dialog) {
	if (!dialog._selected.material) {
		frappe.msgprint(__('Please select a material.'));
		return;
	}

	const missing = dialog._current_attrs.find(attr => !dialog._attr_values[attr.attribute]);
	if (missing) {
		frappe.msgprint(__('Please select a value for: {0}', [missing.label || missing.attribute]));
		return;
	}

	const attributes = {};
	dialog._current_attrs.forEach(attr => {
		attributes[attr.attribute] = dialog._attr_values[attr.attribute];
	});

	frappe.call({
		method: 'pp_erp.api.item_variant_utils.find_item_variant',
		args: { template_item_code: dialog._selected.material, attributes },
		freeze: true,
		freeze_message: __('Finding item...'),
		callback: function(r) {
			if (!r.message) {
				frappe.msgprint({
					title: __('Item Not Available'),
					message: __('No matching item variant found for the selected attributes.'),
					indicator: 'red'
				});
				return;
			}

			const item_code = r.message.item_code;
			frappe.model.set_value(dialog._cdt, dialog._cdn, 'item_code', item_code);
			frappe.show_alert({ message: __('{0} added', [item_code]), indicator: 'green' }, 3);
			dialog.hide();
		}
	});
}