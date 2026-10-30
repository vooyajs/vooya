use vooya as voo;
#[derive(voo::ToJs, Clone, PartialEq)]
pub struct Snapshot { pub count: u32, pub light: bool }
#[derive(Default)]
pub struct Counter { count: u32 }
#[voo::store]
impl Counter {
    #[voo::action]
    pub fn add(&mut self) -> u32 { self.count += 1; self.count }
    #[voo::snapshot]
    pub fn snapshot(&self) -> Snapshot { Snapshot { count: self.count, light: true } }
}
