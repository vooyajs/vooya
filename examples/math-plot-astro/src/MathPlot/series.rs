pub fn sample_count(requested: usize) -> usize {
    requested.clamp(16, 4096)
}
