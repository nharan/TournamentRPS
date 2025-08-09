use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn keccak256(_input: &[u8]) -> String { "0x00".to_string() }

#[wasm_bindgen]
pub fn poseidon2(_input: &[u8]) -> String { "0x00".to_string() }

#[wasm_bindgen]
pub fn merkle_root(_leaves: JsValue) -> String { "0x00".to_string() }

#[wasm_bindgen]
pub fn verify_vrf(_msg: &[u8], _output: &[u8], _proof: &[u8]) -> bool { true }
