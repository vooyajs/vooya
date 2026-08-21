use vooya as voo;

#[voo::props(id = "schema_usage::CartProps")]
pub struct CartProps {
    pub initial_items: u32,
    pub coupon: Option<String>,
}

#[voo::events(id = "schema_usage::CartEvents")]
pub trait CartEvents {
    fn checked_out(order_id: u64);
}

pub struct Cart;

#[voo::store(id = "schema_usage::Cart")]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, quantity: u32) {
        let _ = quantity;
    }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartProps {
        CartProps {
            initial_items: 0,
            coupon: None,
        }
    }
}

#[allow(non_snake_case)]
#[voo::component(id = "schema_usage::CartPanel")]
pub fn CartPanel(props: CartProps) {
    let _ = props;
}

#[test]
fn role_macros_compile_for_public_roots() {
    let mut cart = Cart;
    cart.add(1);
    assert_eq!(cart.snapshot().initial_items, 0);
    CartPanel(CartProps {
        initial_items: 0,
        coupon: None,
    });
}
