import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:test/test.dart';
import '../lib/release.dart';

void main() {
  test('signed metadata pins version, platform, repository, size and digest',
      () async {
    final alg = Ed25519(),
        key = await Ed25519().newKeyPair(),
        pub = base64Encode(
            (await (await Ed25519().newKeyPair()).extractPublicKey()).bytes);
    final own = base64Encode((await key.extractPublicKey()).bytes);
    final data = {
      'schema': 1,
      'platform': 'windows-x86_64',
      'version': '2.0.1',
      'filename': 'The Records Project_2.0.1_x64_en-US.msi',
      'size': 1234,
      'sha256': 'a' * 64,
      'url':
          'https://github.com/$repository/releases/download/v2.0.1/The%20Records%20Project_2.0.1_x64_en-US.msi'
    };
    Future<void> verify(Map<String, dynamic> value,
        {bool valid = false}) async {
      final bytes = utf8.encode(jsonEncode(value)),
          sig = base64Encode((await alg.sign(bytes, keyPair: key)).bytes);
      if (valid) {
        expect(
            (await verifyManifest(bytes, sig, '2.0.1', publicKey: own))['size'],
            1234);
      } else {
        await expectLater(verifyManifest(bytes, sig, '2.0.1', publicKey: own),
            throwsFormatException);
      }
    }

    await verify(data, valid: true);
    for (final patch in [
      {'version': '2.0.0'},
      {'platform': 'linux'},
      {'size': -1},
      {'size': maximumInstallerBytes + 1},
      {'sha256': 'invalid'},
      {'url': 'https://example.com/update.msi'},
      {'filename': '../bad_x64_en-US.msi'}
    ]) {
      await verify({...data, ...patch});
    }
    final bytes = utf8.encode(jsonEncode(data)),
        sig = base64Encode((await alg.sign(bytes, keyPair: key)).bytes);
    await expectLater(verifyManifest(bytes, sig, '2.0.1', publicKey: pub),
        throwsFormatException);
    await expectLater(
        verifyManifest([...bytes, 32], sig, '2.0.1', publicKey: own),
        throwsFormatException);
  });
  test('numeric versions prevent lexical version mistakes and reject labels',
      () {
    expect(stableVersion('2.0.10') > stableVersion('2.0.9'), isTrue);
    expect(() => stableVersion('Nostra-2'), throwsFormatException);
    expect(() => stableVersion('2.0.1-beta'), throwsFormatException);
  });
  test('hashes downloads as a stream', () async {
    expect(await hashStream(Stream.value(utf8.encode('abc'))),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
}
