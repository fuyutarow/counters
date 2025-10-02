use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_groth16::VerifyingKey;
use ark_serialize::CanonicalSerialize;
use serde::Deserialize;
use std::fs;
use std::str::FromStr;

#[derive(Deserialize)]
struct SnarkjsVK {
    #[serde(rename = "vk_alpha_1")]
    vk_alpha_1: Vec<String>,
    #[serde(rename = "vk_beta_2")]
    vk_beta_2: Vec<Vec<String>>,
    #[serde(rename = "vk_gamma_2")]
    vk_gamma_2: Vec<Vec<String>>,
    #[serde(rename = "vk_delta_2")]
    vk_delta_2: Vec<Vec<String>>,
    #[serde(rename = "IC")]
    ic: Vec<Vec<String>>,
}

fn parse_g1_affine(coords: &[String]) -> G1Affine {
    let x_str = &coords[0];
    let y_str = &coords[1];

    let x = Fq::from_str(x_str).unwrap();
    let y = Fq::from_str(y_str).unwrap();

    G1Affine::new(x, y)
}

fn parse_g2_affine(coords: &[Vec<String>]) -> G2Affine {
    // snarkjs format: [[x0, x1], [y0, y1], [1, 0]]
    // Fq2 = c0 + c1 * u where c0 is first element, c1 is second
    let x0 = Fq::from_str(&coords[0][0]).unwrap();
    let x1 = Fq::from_str(&coords[0][1]).unwrap();
    let y0 = Fq::from_str(&coords[1][0]).unwrap();
    let y1 = Fq::from_str(&coords[1][1]).unwrap();

    let x = Fq2::new(x0, x1);
    let y = Fq2::new(y0, y1);

    G2Affine::new(x, y)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: {} <input_vk.json> <output_vk.bin>", args[0]);
        std::process::exit(1);
    }

    let input_path = &args[1];
    let output_path = &args[2];

    // Read snarkjs VK JSON
    let vk_json = fs::read_to_string(input_path).expect("Failed to read input file");
    let snarkjs_vk: SnarkjsVK = serde_json::from_str(&vk_json).expect("Failed to parse JSON");

    // Convert to arkworks VerifyingKey
    let alpha_g1 = parse_g1_affine(&snarkjs_vk.vk_alpha_1);
    let beta_g2 = parse_g2_affine(&snarkjs_vk.vk_beta_2);
    let gamma_g2 = parse_g2_affine(&snarkjs_vk.vk_gamma_2);
    let delta_g2 = parse_g2_affine(&snarkjs_vk.vk_delta_2);

    let gamma_abc_g1: Vec<G1Affine> = snarkjs_vk
        .ic
        .iter()
        .map(|coords| parse_g1_affine(coords))
        .collect();

    let vk = VerifyingKey::<Bn254> {
        alpha_g1,
        beta_g2,
        gamma_g2,
        delta_g2,
        gamma_abc_g1,
    };

    // Serialize in Arkworks canonical compressed format
    let mut vk_bytes = Vec::new();
    vk.serialize_compressed(&mut vk_bytes)
        .expect("Failed to serialize VK");

    // Write to file
    fs::write(output_path, &vk_bytes).expect("Failed to write output file");

    println!("✅ Converted VK to Arkworks format");
    println!("   Input:  {}", input_path);
    println!("   Output: {}", output_path);
    println!("   Size:   {} bytes", vk_bytes.len());
    println!("   Hex:    {}", hex::encode(&vk_bytes));
}
