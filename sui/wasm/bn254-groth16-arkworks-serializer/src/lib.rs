use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_groth16::Proof;
use ark_serialize::CanonicalSerialize;
use serde::Deserialize;
use std::str::FromStr;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct SnarkjsProof {
    pi_a: Vec<String>,
    pi_b: Vec<Vec<String>>,
    pi_c: Vec<String>,
}

#[wasm_bindgen]
pub fn convert_proof_to_arkworks(proof_json: &str) -> Result<Vec<u8>, JsValue> {
    // JSONパース
    let snarkjs_proof: SnarkjsProof = serde_json::from_str(proof_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    // G1点パース (pi_a, pi_c)
    let a = parse_g1_affine(&snarkjs_proof.pi_a)
        .map_err(|e| JsValue::from_str(&format!("pi_a parse error: {}", e)))?;
    let c = parse_g1_affine(&snarkjs_proof.pi_c)
        .map_err(|e| JsValue::from_str(&format!("pi_c parse error: {}", e)))?;

    // G2点パース (pi_b)
    let b = parse_g2_affine(&snarkjs_proof.pi_b)
        .map_err(|e| JsValue::from_str(&format!("pi_b parse error: {}", e)))?;

    // Arkworks Proof構造体
    let proof = Proof::<Bn254> { a, b, c };

    // 圧縮直列化: A(32B) + B(64B) + C(32B) = 128B
    let mut proof_bytes = Vec::with_capacity(128);
    proof
        .a
        .serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize A error: {}", e)))?;
    proof
        .b
        .serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize B error: {}", e)))?;
    proof
        .c
        .serialize_compressed(&mut proof_bytes)
        .map_err(|e| JsValue::from_str(&format!("Serialize C error: {}", e)))?;

    // 長さ検証
    if proof_bytes.len() != 128 {
        return Err(JsValue::from_str(&format!(
            "Invalid proof size: expected 128, got {}",
            proof_bytes.len()
        )));
    }

    Ok(proof_bytes)
}

#[wasm_bindgen]
pub fn convert_public_inputs_to_bytes(inputs_json: &str) -> Result<Vec<u8>, JsValue> {
    let inputs: Vec<String> = serde_json::from_str(inputs_json)
        .map_err(|e| JsValue::from_str(&format!("JSON parse error: {}", e)))?;

    let mut result = Vec::with_capacity(inputs.len() * 32);

    for input in inputs {
        let value =
            Fq::from_str(&input).map_err(|_| JsValue::from_str("Failed to parse field element"))?;

        // リトルエンディアン32バイト
        let mut bytes = vec![0u8; 32];
        value
            .serialize_compressed(&mut bytes)
            .map_err(|e| JsValue::from_str(&format!("Serialize error: {:?}", e)))?;

        result.extend_from_slice(&bytes);
    }

    Ok(result)
}

fn parse_g1_affine(coords: &[String]) -> Result<G1Affine, String> {
    if coords.len() < 2 {
        return Err("G1 point requires at least 2 coordinates".to_string());
    }

    let x = Fq::from_str(&coords[0]).map_err(|_| "Failed to parse x coordinate".to_string())?;
    let y = Fq::from_str(&coords[1]).map_err(|_| "Failed to parse y coordinate".to_string())?;

    Ok(G1Affine::new(x, y))
}

fn parse_g2_affine(coords: &[Vec<String>]) -> Result<G2Affine, String> {
    if coords.len() < 2 || coords[0].len() < 2 || coords[1].len() < 2 {
        return Err("G2 point requires 2x2 coordinates".to_string());
    }

    let x0 = Fq::from_str(&coords[0][0]).map_err(|_| "Failed to parse x0".to_string())?;
    let x1 = Fq::from_str(&coords[0][1]).map_err(|_| "Failed to parse x1".to_string())?;
    let y0 = Fq::from_str(&coords[1][0]).map_err(|_| "Failed to parse y0".to_string())?;
    let y1 = Fq::from_str(&coords[1][1]).map_err(|_| "Failed to parse y1".to_string())?;

    let x = Fq2::new(x0, x1); // c0, c1順
    let y = Fq2::new(y0, y1); // c0, c1順

    Ok(G2Affine::new(x, y))
}
