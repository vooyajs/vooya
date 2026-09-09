pub fn backing_scale(device_pixel_ratio: f64) -> f64 {
    device_pixel_ratio.clamp(1.0, 3.0)
}
