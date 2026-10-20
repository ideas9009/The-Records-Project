import 'dart:convert';
import 'dart:io';
import '../lib/release.dart';

Future<void> main(List<String> args) async {
  final dir = Directory(args.single),
      bytes = await File('${dir.path}/$manifestName').readAsBytes(),
      sig = await File('${dir.path}/$manifestName.sig').readAsString();
  final version =
      (jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>)['build']
          .toString();
  final metadata = await verifyManifest(bytes, sig, version),
      msi = File('${dir.path}/${metadata['filename']}');
  if (await msi.length() != metadata['size'] ||
      await hashStream(msi.openRead()) != metadata['sha256'])
    throw const FormatException(
        'The MSI does not match the signed release metadata.');
  print(
      'Verified the signed release metadata and MSI digest for $version. No installation was performed.');
}
