import 'dart:convert';
import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'public_key.dart';

const repository = 'ideas9009/The-Records-Project';
const manifestName = 'update-windows-x86_64.json';
const maximumInstallerBytes = 256 * 1024 * 1024;
int buildNumber(String value) {
  if (!RegExp(r'^(0|[1-9][0-9]{0,8})$').hasMatch(value)) {
    throw const FormatException(
        'Release tags must be numeric build numbers, such as 1 or 2.');
  }
  return int.parse(value);
}

Future<Map<String, dynamic>> verifyManifest(
    List<int> bytes, String signature, String version,
    {String publicKey = updatePublicKey}) async {
  if (bytes.length > 16384)
    throw const FormatException('Update metadata is too large.');
  final sig = Signature(base64Decode(signature.trim()),
      publicKey:
          SimplePublicKey(base64Decode(publicKey), type: KeyPairType.ed25519));
  if (!await Ed25519().verify(bytes, signature: sig))
    throw const FormatException('The update signature is invalid.');
  final data = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
  buildNumber(version);
  final filename = data['filename'];
  if (data['schema'] != 2 ||
      data['platform'] != 'windows-x86_64' ||
      data['build'] != buildNumber(version) ||
      filename is! String ||
      !RegExp(r'^[A-Za-z0-9_. -]+_x64_en-US\.msi$').hasMatch(filename) ||
      data['size'] is! int ||
      data['size'] <= 0 ||
      data['size'] > maximumInstallerBytes ||
      data['sha256'] is! String ||
      !RegExp(r'^[a-f0-9]{64}$').hasMatch(data['sha256']) ||
      data['url'] !=
          'https://github.com/$repository/releases/download/$version/${Uri.encodeComponent(filename)}')
    throw const FormatException(
        'The update metadata does not match this Windows release.');
  return data;
}

Future<String> hashStream(Stream<List<int>> bytes) async =>
    (await crypto.sha256.bind(bytes).first).toString();
