use ark_bn254::{Bn254, Fq, Fq2, G1Affine, G2Affine};
use ark_groth16::Proof;
use ark_serialize::CanonicalSerialize;
use serde::Deserialize;
use std::fs;
use std::str::FromStr;

#[derive(Deserialize)]
struct SnarkjsProof {
    pi_a: Vec<String>,
    pi_b: Vec<Vec<String>>,
    pi_c: Vec<String>,
}

fn parse_g1_affine(coords: &[String]) -> G1Affine {
    let x_str = &coords[0];
    let y_str = &coords[1];

    let x = Fq::from_str(x_str).unwrap();
    let y = Fq::from_str(y_str).unwrap();

    G1Affine::new(x, y)
}

fn parse_g2_affine(coords: &[Vec<String>]) -> G2Affine {
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
        eprintln!("Usage: {} <input_proof.json> <output_proof.bin>", args[0]);
        std::process::exit(1);
    }

    let input_path = &args[1];
    let output_path = &args[2];

    // Read snarkjs proof JSON
    let proof_json = fs::read_to_string(input_path)
        .expect("Failed to read input file");
    let snarkjs_proof: SnarkjsProof = serde_json::from_str(&proof_json)
        .expect("Failed to parse JSON");

    // Convert to arkworks Proof
    let a = parse_g1_affine(&snarkjs_proof.pi_a);
    let b = parse_g2_affine(&snarkjs_proof.pi_b);
    let c = parse_g1_affine(&snarkjs_proof.pi_c);

    let proof = Proof::<Bn254> { a, b, c };

    // Serialize each component separately (compressed) and concatenate
    let mut proof_bytes = Vec::new();
    proof.a.serialize_compressed(&mut proof_bytes)
        .expect("Failed to serialize proof.a");
    proof.b.serialize_compressed(&mut proof_bytes)
        .expect("Failed to serialize proof.b");
    proof.c.serialize_compressed(&mut proof_bytes)
        .expect("Failed to serialize proof.c");

    // Write to file
    fs::write(output_path, &proof_bytes)
        .expect("Failed to write output file");

    println!("✅ Converted proof to Arkworks format");
    println!("   Input:  {}", input_path);
    println!("   Output: {}", output_path);
    println!("   Size:   {} bytes", proof_bytes.len());
    println!("   Hex:    {}", hex::encode(&proof_bytes));
}
