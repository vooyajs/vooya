use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use js_sys::Array;
use serde::Deserialize;
use vooya as voo;
use wasm_bindgen::{JsCast, JsValue, closure::Closure};
use web_sys::{
    CanvasRenderingContext2d, CustomEvent, CustomEventInit, HtmlCanvasElement, KeyboardEvent,
    PointerEvent, WheelEvent,
};

mod axes;
mod interaction;
mod render;
mod series;
mod spec;

thread_local! { static MOUNT_SEQUENCE: Cell<u32> = const { Cell::new(0) }; }

#[voo::props]
#[derive(voo::FromJs)]
pub struct MathPlotProps {
    /// Versioned, serializable plot specification. JavaScript closures are intentionally unsupported.
    pub spec: String,
    pub theme: String,
}

#[voo::events]
pub trait MathPlotEvents {
    /// JSON string: `{version, series_id, x, y}`.
    fn probe(payload: String);
}

#[derive(Clone, Copy, Deserialize)]
struct Domain {
    x: [f64; 2],
    y: [f64; 2],
}

#[derive(Clone, Deserialize)]
struct PlotSpec {
    version: u32,
    title: String,
    domain: Domain,
    series: Vec<Series>,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Series {
    Linear {
        id: String,
        label: String,
        w: f64,
        b: f64,
        #[serde(default = "default_samples")]
        samples: usize,
    },
    Line {
        id: String,
        label: String,
        points: Vec<[f64; 2]>,
    },
    Scatter {
        id: String,
        label: String,
        points: Vec<[f64; 2]>,
        #[serde(default = "default_radius")]
        radius: f64,
    },
}

fn default_samples() -> usize {
    256
}
fn default_radius() -> f64 {
    3.5
}

#[derive(Clone, Copy)]
struct Drag {
    x: f64,
    y: f64,
    domain: Domain,
}

struct PlotState {
    spec: PlotSpec,
    viewport: Domain,
    drag: Option<Drag>,
    revision: u32,
}

#[derive(Clone, Copy)]
struct CanvasGeometry {
    width: f64,
    height: f64,
    plot: [f64; 4],
}

#[voo::component(update = "update_math_plot")]
#[voo::style("./MathPlot.css", scoped)]
pub fn MathPlot(view: &voo::View, props: MathPlotProps) -> Result<voo::ViewElement, JsValue> {
    let spec = parse_spec(&props.spec)?;
    let root = view
        .element("section")?
        .class("vooya-math-plot")
        .attribute("data-math-plot", "")?
        .attribute("data-theme", &props.theme)?;
    let header = view.element("header")?.class("vooya-math-header");
    let title = view
        .element("strong")?
        .class("vooya-math-title")
        .text(&spec.title);
    let status = view
        .element("span")?
        .class("vooya-math-status")
        .text(spec::ENGINE_LABEL);
    let reset = view
        .element("button")?
        .class("vooya-math-reset")
        .attribute("type", "button")?
        .text("Reset view");
    let canvas = view
        .element("canvas")?
        .class("vooya-math-canvas")
        .attribute("tabindex", "0")?
        .attribute("role", "img")?
        .attribute("aria-label", &aria_label(&spec, &spec.domain))?;
    let help = view
        .element("p")?
        .class("vooya-math-help")
        .text("Drag to pan · wheel or +/− to zoom · arrows to pan · 0 to reset");
    header.append(&title)?;
    header.append(&status)?;
    header.append(&reset)?;
    root.append(&header)?;
    root.append(&canvas)?;
    root.append(&help)?;

    let canvas: HtmlCanvasElement = canvas.as_element().clone().dyn_into()?;
    let state = Rc::new(RefCell::new(PlotState {
        viewport: spec.domain,
        spec,
        drag: None,
        revision: 0,
    }));

    MOUNT_SEQUENCE.with(|sequence| {
        let next = sequence.get() + 1;
        sequence.set(next);
        let _ = root
            .as_element()
            .set_attribute("data-mount-token", &next.to_string());
    });
    record_lifecycle("mount");
    draw(&canvas, &root, &state.borrow())?;

    let update_state = state.clone();
    let update_canvas = canvas.clone();
    let update_root = root.clone();
    let update_title = title.clone();
    root.on_owned("vooya-internal-props", move |event| {
        let Some(event) = event.dyn_ref::<CustomEvent>() else {
            return;
        };
        let Ok(request) = event.detail().dyn_into::<Array>() else {
            return;
        };
        let result = (|| -> Result<(), JsValue> {
            let source = request
                .get(0)
                .as_string()
                .ok_or_else(|| JsValue::from_str("Math Plot update spec must be a string"))?;
            let theme = request
                .get(1)
                .as_string()
                .ok_or_else(|| JsValue::from_str("Math Plot update theme must be a string"))?;
            let spec = parse_spec(&source)?;
            let current = update_state.borrow();
            let domain_changed =
                current.spec.domain.x != spec.domain.x || current.spec.domain.y != spec.domain.y;
            let next = PlotState {
                viewport: if domain_changed {
                    spec.domain
                } else {
                    current.viewport
                },
                spec,
                drag: current.drag,
                revision: current.revision + 1,
            };
            drop(current);
            draw(&update_canvas, &update_root, &next)?;
            update_root
                .as_element()
                .set_attribute("data-theme", &theme)?;
            update_root
                .as_element()
                .set_attribute("data-spec-revision", &next.revision.to_string())?;
            update_title.set_text(&next.spec.title);
            *update_state.borrow_mut() = next;
            Ok(())
        })();
        request.set(
            2,
            match result {
                Ok(()) => JsValue::NULL,
                Err(error) => error,
            },
        );
    })?;

    let resize_state = state.clone();
    let resize_canvas = canvas.clone();
    let resize_root = root.clone();
    let resize: Closure<dyn FnMut()> = Closure::new(move || {
        let _ = draw(&resize_canvas, &resize_root, &resize_state.borrow());
    });
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("window unavailable"))?;
    window.add_event_listener_with_callback("resize", resize.as_ref().unchecked_ref())?;
    root.defer_cleanup({
        let window = window.clone();
        move || {
            let _ = window
                .remove_event_listener_with_callback("resize", resize.as_ref().unchecked_ref());
        }
    });
    let first_frame_state = state.clone();
    let first_frame_canvas = canvas.clone();
    let first_frame_root = root.clone();
    let first_frame = Closure::once_into_js(move || {
        let _ = draw(
            &first_frame_canvas,
            &first_frame_root,
            &first_frame_state.borrow(),
        );
    });
    window.request_animation_frame(first_frame.unchecked_ref())?;

    let down_state = state.clone();
    let down_canvas = canvas.clone();
    owned_listener(&root, &canvas, "pointerdown", move |event: PointerEvent| {
        event.prevent_default();
        let _ = down_canvas.set_pointer_capture(event.pointer_id());
        let domain = down_state.borrow().viewport;
        down_state.borrow_mut().drag = Some(Drag {
            x: event.client_x() as f64,
            y: event.client_y() as f64,
            domain,
        });
    })?;
    attach_pointer_handlers(&root, &canvas, state.clone(), view.clone())?;

    let reset_state = state.clone();
    let reset_canvas = canvas.clone();
    let reset_root = root.clone();
    reset.on_owned("click", move |_| {
        let domain = reset_state.borrow().spec.domain;
        reset_state.borrow_mut().viewport = domain;
        let _ = draw(&reset_canvas, &reset_root, &reset_state.borrow());
    })?;

    root.defer_cleanup(|| record_lifecycle("dispose"));
    Ok(root)
}

fn update_math_plot(root: &voo::ViewElement, props: MathPlotProps) -> Result<(), JsValue> {
    let request = Array::new();
    request.push(&JsValue::from_str(&props.spec));
    request.push(&JsValue::from_str(&props.theme));
    request.push(&JsValue::UNDEFINED);
    let init = CustomEventInit::new();
    init.set_detail(request.as_ref());
    let event: web_sys::Event =
        CustomEvent::new_with_event_init_dict("vooya-internal-props", &init)?.into();
    root.as_element().dispatch_event(&event)?;
    let result = request.get(2);
    if result.is_null() {
        Ok(())
    } else if result.is_undefined() {
        Err(JsValue::from_str(
            "Math Plot update listener is unavailable",
        ))
    } else {
        Err(result)
    }
}

fn attach_pointer_handlers(
    root: &voo::ViewElement,
    canvas: &HtmlCanvasElement,
    state: Rc<RefCell<PlotState>>,
    view: voo::View,
) -> Result<(), JsValue> {
    let move_state = state.clone();
    let move_canvas = canvas.clone();
    let move_root = root.clone();
    let move_view = view.clone();
    owned_listener(root, canvas, "pointermove", move |event: PointerEvent| {
        let rect = move_canvas.get_bounding_client_rect();
        let geometry = canvas_geometry(rect.width(), rect.height());
        let mut state = move_state.borrow_mut();
        if let Some(drag) = &state.drag {
            let width = rect.width().max(1.0);
            let height = rect.height().max(1.0);
            let dx =
                (event.client_x() as f64 - drag.x) / width * (drag.domain.x[1] - drag.domain.x[0]);
            let dy =
                (event.client_y() as f64 - drag.y) / height * (drag.domain.y[1] - drag.domain.y[0]);
            state.viewport = Domain {
                x: [drag.domain.x[0] - dx, drag.domain.x[1] - dx],
                y: [drag.domain.y[0] + dy, drag.domain.y[1] + dy],
            };
            let _ = draw(&move_canvas, &move_root, &state);
        } else if let Some(probe) = nearest_probe(
            &state,
            logical_pointer_coordinate(
                event.client_x() as f64 - rect.left(),
                rect.width(),
                geometry.width,
            ),
            logical_pointer_coordinate(
                event.client_y() as f64 - rect.top(),
                rect.height(),
                geometry.height,
            ),
            geometry,
        ) {
            let _ = move_view.emit("probe", JsValue::from_str(&probe));
        }
    })?;
    let up_state = state.clone();
    owned_listener(root, canvas, "pointerup", move |_event: PointerEvent| {
        up_state.borrow_mut().drag = None;
    })?;
    let leave_state = state.clone();
    owned_listener(
        root,
        canvas,
        "pointercancel",
        move |_event: PointerEvent| {
            leave_state.borrow_mut().drag = None;
        },
    )?;

    let wheel_state = state.clone();
    let wheel_canvas = canvas.clone();
    let wheel_root = root.clone();
    owned_listener(root, canvas, "wheel", move |event: WheelEvent| {
        event.prevent_default();
        let rect = wheel_canvas.get_bounding_client_rect();
        zoom_at(
            &mut wheel_state.borrow_mut(),
            interaction::wheel_zoom_factor(event.delta_y()),
            event.client_x() as f64 - rect.left(),
            event.client_y() as f64 - rect.top(),
            rect.width(),
            rect.height(),
        );
        let _ = draw(&wheel_canvas, &wheel_root, &wheel_state.borrow());
    })?;

    let key_state = state.clone();
    let key_canvas = canvas.clone();
    let key_root = root.clone();
    owned_listener(root, canvas, "keydown", move |event: KeyboardEvent| {
        let mut state = key_state.borrow_mut();
        let x_span = state.viewport.x[1] - state.viewport.x[0];
        let y_span = state.viewport.y[1] - state.viewport.y[0];
        match event.key().as_str() {
            "ArrowLeft" => {
                state.viewport.x = [
                    state.viewport.x[0] - x_span * 0.08,
                    state.viewport.x[1] - x_span * 0.08,
                ]
            }
            "ArrowRight" => {
                state.viewport.x = [
                    state.viewport.x[0] + x_span * 0.08,
                    state.viewport.x[1] + x_span * 0.08,
                ]
            }
            "ArrowUp" => {
                state.viewport.y = [
                    state.viewport.y[0] + y_span * 0.08,
                    state.viewport.y[1] + y_span * 0.08,
                ]
            }
            "ArrowDown" => {
                state.viewport.y = [
                    state.viewport.y[0] - y_span * 0.08,
                    state.viewport.y[1] - y_span * 0.08,
                ]
            }
            "+" | "=" => zoom_at(&mut state, 0.84, 0.0, 0.0, 0.0, 0.0),
            "-" | "_" => zoom_at(&mut state, 1.18, 0.0, 0.0, 0.0, 0.0),
            "0" => state.viewport = state.spec.domain,
            _ => return,
        }
        event.prevent_default();
        let _ = draw(&key_canvas, &key_root, &state);
    })?;
    Ok(())
}

fn owned_listener<E: JsCast + wasm_bindgen::convert::FromWasmAbi + 'static>(
    root: &voo::ViewElement,
    canvas: &HtmlCanvasElement,
    name: &str,
    handler: impl FnMut(E) + 'static,
) -> Result<(), JsValue> {
    let callback = Closure::<dyn FnMut(E)>::new(handler);
    canvas.add_event_listener_with_callback(name, callback.as_ref().unchecked_ref())?;
    let canvas = canvas.clone();
    let name = name.to_owned();
    root.defer_cleanup(move || {
        let _ =
            canvas.remove_event_listener_with_callback(&name, callback.as_ref().unchecked_ref());
    });
    Ok(())
}

fn parse_spec(source: &str) -> Result<PlotSpec, JsValue> {
    let spec: PlotSpec = serde_json::from_str(source)
        .map_err(|error| JsValue::from_str(&format!("invalid Math Plot spec: {error}")))?;
    if spec.version != 1 {
        return Err(JsValue::from_str(
            "unsupported Math Plot spec version; expected 1",
        ));
    }
    validate_domain(spec.domain)?;
    if spec.series.is_empty() {
        return Err(JsValue::from_str(
            "Math Plot spec requires at least one series",
        ));
    }
    Ok(spec)
}

fn validate_domain(domain: Domain) -> Result<(), JsValue> {
    if !domain
        .x
        .iter()
        .chain(domain.y.iter())
        .all(|value| value.is_finite())
        || domain.x[0] >= domain.x[1]
        || domain.y[0] >= domain.y[1]
    {
        return Err(JsValue::from_str(
            "Math Plot domain must contain finite ascending ranges",
        ));
    }
    Ok(())
}

fn draw(
    canvas: &HtmlCanvasElement,
    root: &voo::ViewElement,
    state: &PlotState,
) -> Result<(), JsValue> {
    let rect = canvas.get_bounding_client_rect();
    let geometry = canvas_geometry(rect.width(), rect.height());
    let width = geometry.width;
    let height = geometry.height;
    let ratio = render::canvas2d::backing_scale(web_sys::window()
        .map(|window| window.device_pixel_ratio())
        .unwrap_or(1.0));
    canvas.set_width((width * ratio).round() as u32);
    canvas.set_height((height * ratio).round() as u32);
    let context: CanvasRenderingContext2d = canvas
        .get_context("2d")?
        .ok_or_else(|| JsValue::from_str("2d canvas unavailable"))?
        .dyn_into()?;
    context.set_transform(ratio, 0.0, 0.0, ratio, 0.0, 0.0)?;
    let style = web_sys::window()
        .and_then(|window| window.get_computed_style(root.as_element()).ok())
        .flatten();
    let color = |name: &str, fallback: &str| {
        style
            .as_ref()
            .and_then(|style| style.get_property_value(name).ok())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| fallback.to_owned())
    };
    let background = color("--vooya-plot-bg", "#ffffff");
    let grid = color("--vooya-plot-grid", "#dce5d8");
    let axis = color("--vooya-plot-axis", "#657565");
    let text = color("--vooya-plot-text", "#172019");
    let accent = color("--vooya-plot-accent", "#3157d5");
    let point = color("--vooya-plot-point", "#e44f73");
    context.set_fill_style_str(&background);
    context.fill_rect(0.0, 0.0, width, height);
    let plot = geometry.plot;
    context.set_font("11px ui-monospace, monospace");
    context.set_line_width(1.0);
    for index in 0..=axes::GRID_STEPS {
        let t = index as f64 / axes::GRID_STEPS as f64;
        let x = plot[0] + plot[2] * t;
        let y = plot[1] + plot[3] * t;
        context.set_stroke_style_str(&grid);
        line(&context, x, plot[1], x, plot[1] + plot[3]);
        line(&context, plot[0], y, plot[0] + plot[2], y);
        context.set_fill_style_str(&text);
        let x_value = mix(state.viewport.x[0], state.viewport.x[1], t);
        let y_value = mix(state.viewport.y[1], state.viewport.y[0], t);
        let _ = context.fill_text(&format_tick(x_value), x - 12.0, plot[1] + plot[3] + 18.0);
        let _ = context.fill_text(&format_tick(y_value), 7.0, y + 4.0);
    }
    context.set_stroke_style_str(&axis);
    if state.viewport.x[0] <= 0.0 && state.viewport.x[1] >= 0.0 {
        let x = sx(0.0, state.viewport, plot);
        line(&context, x, plot[1], x, plot[1] + plot[3]);
    }
    if state.viewport.y[0] <= 0.0 && state.viewport.y[1] >= 0.0 {
        let y = sy(0.0, state.viewport, plot);
        line(&context, plot[0], y, plot[0] + plot[2], y);
    }
    for series in &state.spec.series {
        match series {
            Series::Linear { w, b, samples, .. } => {
                context.set_stroke_style_str(&accent);
                context.set_line_width(2.25);
                context.begin_path();
                let count = series::sample_count(*samples);
                for index in 0..count {
                    let x = mix(
                        state.viewport.x[0],
                        state.viewport.x[1],
                        index as f64 / (count - 1) as f64,
                    );
                    let position = (
                        sx(x, state.viewport, plot),
                        sy(w * x + b, state.viewport, plot),
                    );
                    if index == 0 {
                        context.move_to(position.0, position.1);
                    } else {
                        context.line_to(position.0, position.1);
                    }
                }
                context.stroke();
            }
            Series::Line { points, .. } => {
                context.set_stroke_style_str(&accent);
                context.set_line_width(2.0);
                context.begin_path();
                for (index, value) in points.iter().enumerate() {
                    let position = (
                        sx(value[0], state.viewport, plot),
                        sy(value[1], state.viewport, plot),
                    );
                    if index == 0 {
                        context.move_to(position.0, position.1);
                    } else {
                        context.line_to(position.0, position.1);
                    }
                }
                context.stroke();
            }
            Series::Scatter { points, radius, .. } => {
                context.set_fill_style_str(&point);
                for value in points {
                    context.begin_path();
                    context.arc(
                        sx(value[0], state.viewport, plot),
                        sy(value[1], state.viewport, plot),
                        *radius,
                        0.0,
                        std::f64::consts::TAU,
                    )?;
                    context.fill();
                }
            }
        }
    }
    canvas.set_attribute("aria-label", &aria_label(&state.spec, &state.viewport))?;
    root.as_element().set_attribute(
        "data-viewport",
        &format!(
            "{:.3},{:.3},{:.3},{:.3}",
            state.viewport.x[0], state.viewport.x[1], state.viewport.y[0], state.viewport.y[1]
        ),
    )?;
    Ok(())
}

fn canvas_geometry(css_width: f64, css_height: f64) -> CanvasGeometry {
    let width = css_width.max(320.0);
    let height = css_height.max(240.0);
    CanvasGeometry {
        width,
        height,
        plot: [56.0, 22.0, width - 86.0, height - 68.0],
    }
}

fn logical_pointer_coordinate(coordinate: f64, css_size: f64, logical_size: f64) -> f64 {
    coordinate * logical_size / css_size.max(1.0)
}

fn nearest_probe(state: &PlotState, px: f64, py: f64, geometry: CanvasGeometry) -> Option<String> {
    let plot = geometry.plot;
    if px < plot[0] || py < plot[1] || px > plot[0] + plot[2] || py > plot[1] + plot[3] {
        return None;
    }
    let x = mix(
        state.viewport.x[0],
        state.viewport.x[1],
        (px - plot[0]) / plot[2],
    );
    let mut best: Option<(&str, f64, f64, f64)> = None;
    for series in &state.spec.series {
        match series {
            Series::Linear { id, w, b, .. } => {
                consider(&mut best, id, x, w * x + b, px, py, state.viewport, plot)
            }
            Series::Line { id, points, .. } | Series::Scatter { id, points, .. } => {
                for value in points {
                    consider(
                        &mut best,
                        id,
                        value[0],
                        value[1],
                        px,
                        py,
                        state.viewport,
                        plot,
                    );
                }
            }
        }
    }
    best.filter(|value| value.3 <= 34.0).map(|(id, x, y, _)| {
        serde_json::json!({ "version": 1, "series_id": id, "x": x, "y": y }).to_string()
    })
}

fn consider<'a>(
    best: &mut Option<(&'a str, f64, f64, f64)>,
    id: &'a str,
    x: f64,
    y: f64,
    px: f64,
    py: f64,
    domain: Domain,
    plot: [f64; 4],
) {
    let distance = ((sx(x, domain, plot) - px).powi(2) + (sy(y, domain, plot) - py).powi(2)).sqrt();
    if best.as_ref().is_none_or(|current| distance < current.3) {
        *best = Some((id, x, y, distance));
    }
}

fn zoom_at(state: &mut PlotState, factor: f64, px: f64, py: f64, width: f64, height: f64) {
    let tx = if width > 0.0 {
        (px / width).clamp(0.0, 1.0)
    } else {
        0.5
    };
    let ty = if height > 0.0 {
        (py / height).clamp(0.0, 1.0)
    } else {
        0.5
    };
    let center_x = mix(state.viewport.x[0], state.viewport.x[1], tx);
    let center_y = mix(state.viewport.y[1], state.viewport.y[0], ty);
    let x_span = ((state.viewport.x[1] - state.viewport.x[0]) * factor).clamp(0.01, 1.0e6);
    let y_span = ((state.viewport.y[1] - state.viewport.y[0]) * factor).clamp(0.01, 1.0e6);
    state.viewport.x = [center_x - x_span * tx, center_x + x_span * (1.0 - tx)];
    state.viewport.y = [center_y - y_span * (1.0 - ty), center_y + y_span * ty];
}

fn line(context: &CanvasRenderingContext2d, x1: f64, y1: f64, x2: f64, y2: f64) {
    context.begin_path();
    context.move_to(x1, y1);
    context.line_to(x2, y2);
    context.stroke();
}
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn sx(x: f64, domain: Domain, plot: [f64; 4]) -> f64 {
    plot[0] + (x - domain.x[0]) / (domain.x[1] - domain.x[0]) * plot[2]
}
fn sy(y: f64, domain: Domain, plot: [f64; 4]) -> f64 {
    plot[1] + (domain.y[1] - y) / (domain.y[1] - domain.y[0]) * plot[3]
}
fn format_tick(value: f64) -> String {
    if value.abs() >= 1000.0 || (value != 0.0 && value.abs() < 0.01) {
        format!("{value:.1e}")
    } else {
        format!("{value:.2}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_owned()
    }
}
fn aria_label(spec: &PlotSpec, domain: &Domain) -> String {
    let labels = spec
        .series
        .iter()
        .map(|series| match series {
            Series::Linear { label, .. }
            | Series::Line { label, .. }
            | Series::Scatter { label, .. } => label.as_str(),
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "{}. Series: {}. x from {:.2} to {:.2}; y from {:.2} to {:.2}.",
        spec.title, labels, domain.x[0], domain.x[1], domain.y[0], domain.y[1]
    )
}

fn record_lifecycle(phase: &str) {
    let Some(storage) = web_sys::window()
        .and_then(|window| window.session_storage().ok())
        .flatten()
    else {
        return;
    };
    let key = if phase == "mount" {
        "__vooyaMathMounts"
    } else {
        "__vooyaMathDisposes"
    };
    let count = storage
        .get_item(key)
        .ok()
        .flatten()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0)
        + 1;
    let _ = storage.set_item(key, &count.to_string());
}
