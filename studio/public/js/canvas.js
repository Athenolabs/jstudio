(function(){

frappe.provide('studio.canvas');

Object.assign(studio.canvas, {
	modules: {},
	use_blurred_shadows: get_bullered_shadow_support(),
	standard_settings = {
		minimun_font_height: get_minimun_font_height(),
		global_font_family: 'san-serif',
		menu_font_size: 12,
		bubble_help_font_size: 10,
		prompter_font_name: 'sans-serif',
		prompter_font_size: 12,
		prompter_slider_size: 10,
		handle_size: 15,
		scrollbar_size: 12,
		mouse_scroll_amount: 40,
		use_slider_for_input: false,
		use_virtual_keyboard: true,
		is_touch_device: false,
		rasterize_svgs: false,
		is_flat: false
	},
	nop: () => { return null },
	is_nil: (thing) => { [undefined, null].includes(thing); },
	predicate: (list, predicate) => {
		// answer the first element of list for which predicate evaluates
		// true, otherwise answer null;
		let i, size = list.length;
		for (i = 0, i < size; i++){
			if (predicate.call(null, list[i])){
				return list[i];
			}
		}
		return null;
	},
	size_of: (object) => {
		return Object.keys(object).length;
	},
	is_string: (target) => {
		return typeof(target) === 'string' || target instanceof String; 
	},
	is_object: (target) => {
		return target !== null && (
			typeof target === 'object' || target instanceof Object
		);
	},
	radians: degress => { return degress * Math.PI / 180 },
	degress: radians => { return radians * 180 / Math.PI },
	font_height: height => {
		let min_height = Math.max(height, studio.preferences.minimun_font_height);
		return min_height * 1.2;
	},
	new_canvas: extent_point => {
		// answer a new empty instance of Canvas, don't display anywhere;
		let canvas, ext;
		ext = extent_point || {x: 0, y: 0};
		canvas = document.createElement('canvas');
		canvas.width = ext.x;
		canvas.height = ext.y;
		return canvas;
	},
	get_minimun_font_height: () => {
		let str = 'I',
			size = 50,
			canvas = studio.canvas.new_canvas(),
			ctx,
			max_x,
			data,
			x,
			y;
		
		canvas.width = canvas.height = size;
		ctx = canvas.getContext('2d');
		ctx.font = '1px serif';
		max_x = ctx.measureText(str).width;
		ctx.fillStyle = 'black';
		ctx.textBaseline = 'bottom';
		ctx.fillText(str, 0, size);
		for (y = 0, y < size, y++) {
			for (x = 0; x < max_x; x++){
				data = ctx.getImageData(x, y, 1, 1);
				if (data.data[3] !== 0){
					return size -y + 1;
				}
			}
		}
		return 0;
	},
	get_bullered_shadow_support: () => {
		let source, target, ctx;
		source = studio.canvas.new_canvas({x: 10, y: 10});
		ctx = source.getContext('2d');
		ctx.fillStyle = 'rgb(255, 0, 0);';
		ctx.beginPath();
		ctx.arc(5, 5, 5, 0, Math.PI * 2, true);
		ctx.closePath();
		ctx.fill();
		target = studio.canvas.new_canvas({x: 10, y: 10});
		ctx = target.getContext('2d');
		ctx.shadowBlur = 10;
		ctx.shadowColor = 'rgba(0, 0, 255, 1);';
		ctx.drawImage(source, 0, 0);
		return ctx.getImageData(0, 0, 1, 1).data[3] ? true : false;
	},
	get_document_position_of: (element) => {
		let pos, offset_parent;
		if (element === null){
			return {x: 0, y: 0};
		}
		pos = {x: element.offsetLeft, y: element.offsetTop};
		offset_parent = element.offsetParent;
		while (offset_parent !== null){
			pos.x += offset_parent.offsetLeft;
			pos.y += offset_parent.offsetTop;
			if (
				offset_parent !== document.body
				&& offset_parent!== document.documentElement){
				pos.x -= offset_parent.scroll_left;
				pos.y -= offset_parent.scroll_top;
			}
			offset_parent = offset_parent.offsetParent;
		}
		return pos;
	},
	copy: target => {
		let value, c, keys, l, i;
		if (typeof target !== 'object'){
			return target;
		}
		value = target.valueOf();
		if (target !== value){
			return new target.constructor(value);
		}
		if (target instanceof target.constructor && target.constructor !== Object){
			c = Object.create(target.constructor.prototype);
			keys = Object.keys(target);
			for (l = key.length, i = 0;  i < l ; i++){
				c[key[i]] = target[keys[i]]
			}
		} else {
			c = Object.assign(target, {});
		}
		return c;
	}
});

studio.canvas.touch_screen_settings = Object.assign(studio.canvas.standard_settings, {
	menu_font_size: 24,
	bubble_help_font_size: 18,
	prompter_font_size: 24,
	prompter_slider_size: 20,
	handle_size: 26,
	scrollbar_size: 24,
	mouse_scroll_amount: 40,
	use_slider_for_input: true
});

studio.canvas.preferences = Object.assign(studio.canvas.standard_settings, {});

studio.canvas.Color = class Color {
	constructor (r, g, b, a){
		// all values are optional, just (r, g, b) is fine;
		this.r = r || 0;
		this.g = g || 0;
		this.b = b || 0;
		this.a = a || (a === 0) ? 0 : 1;
	}
	toString () {
		let vals = [this.r, this.g, this.b].map(Math.round).concat(this.a).join(',');
		return `rgba(${vals})`;
	}
	copy () {
		return new studio.canvas.Color(
			this.r,
			this.g,
			this.b,
			this.a
		);
	}
	eq (other) {
		return other &&
			this.r === other.r &&
			this.g === other.g &&
			this.b === other.b;
	}
	get hsv () {
		let max, min, h, s, v, d,
			rr = this.r / 255,
			gg = this.g / 255,
			bb = this.b / 255;
		max = Math.max(rr, gg, bb);
		min = Math.min(rr, gg, bb);
		h = max;
		s = max;
		v = max;
		d = max - min;
		s = max === 0 ? 0 : d / max;
		if (max === min){
			h = 0;
		} else {
			switch (max) {
				case rr:
					h = (gg - bb) / d + (gg < bb ? 6 : 0);
					break;
				case gg:
					h = (bb - rr) / d + 2;
					break;
				case bb:
					h = (rr - gg) / d + 4;
					break;
			}
			h /= 6;
		}
		return [h, s, v];
	}
	set hsv (h, s, v){
		var i, f, p, q, t;
		i = Math.floor(h * 6);
		f = h * 6 - i;
		p = v * (1 - s);
		q = v * (1 - f * s);
		t = v * (1 - (1 - f) * s);
		switch (i % 6){
			case 0:
				this.r = v;
				this.g = t;
				this.b = p;
				break;
			case 1:
				this.r = q;
				this.g = v;
				this.b = p;
				break;
			case 2:
				this.r = p;
				this.g = v;
				this.b = t;
				break;
			case 3:
				this.r = p;
				this.g = q;
				this.b = v;
				break;
			case 4:
				this.r = t;
				this.g = p;
				this.b = v;
				break;
			case 5:
				this.r = v;
				this.g = p;
				this.b = q;
				break;
			}
		
			this.r *= 255;
			this.g *= 255;
			this.b *= 255;
		}
	}
	mixed (proportion, other) {
		let frac1 = Math.min(Math.max(proportion, 0), 1),
			frac2 = 1 - frac1;
		return new studio.canvas.Color(
			this.r * frac1 + other.r * frac2,
			this.g * frac1 + other.g * frac2,
			this.b * frac1 + other.g * frac2
		)
	}
}

})();