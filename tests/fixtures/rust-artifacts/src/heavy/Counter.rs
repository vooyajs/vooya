use vooya as voo;
use bevy_ecs::{component::Component, world::World};
#[derive(Component)]
struct Item;
#[derive(voo::ToJs, Clone, PartialEq)]
pub struct Snapshot { pub count: u32, pub heavy: String }
#[derive(Default)]
pub struct Counter { world: World }
#[voo::store]
impl Counter {
    fn item_count(&self) -> u32 { self.world.try_query::<&Item>().map(|mut query| query.iter(&self.world).count() as u32).unwrap_or(0) }
    #[voo::action]
    pub fn add(&mut self) -> u32 { self.world.spawn(Item); self.item_count() }
    #[voo::snapshot]
    pub fn snapshot(&self) -> Snapshot { Snapshot { count: self.item_count(), heavy: "bevy".into() } }
}
