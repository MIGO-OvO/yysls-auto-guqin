use minisign_verify::{PublicKey, Signature};
#[test]
fn signed_update_payload_is_verified_and_tampering_is_rejected() {
    let public =
        PublicKey::decode(include_str!("../../tests/fixtures/signing-public.txt")).unwrap();
    let signature =
        Signature::decode(include_str!("../../tests/fixtures/signing-signature.txt")).unwrap();
    let data = include_bytes!("../../tests/fixtures/signed-payload.bin");
    public.verify(data, &signature, false).unwrap();
    let mut tampered = data.to_vec();
    tampered[0] ^= 1;
    assert!(public.verify(&tampered, &signature, false).is_err());
}
