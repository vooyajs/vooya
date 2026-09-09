pub fn wheel_zoom_factor(delta_y: f64) -> f64 {
    if delta_y < 0.0 { 0.86 } else { 1.16 }
}
