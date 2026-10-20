import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:test/test.dart';
import '../bin/updater.dart' as helper;

class LatestReleaseAdapter implements HttpClientAdapter {
  String tag = '2';
  final routes = <String>[];
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? stream,
      Future<void>? cancelFuture) async {
    routes.add(options.uri.path);
    return ResponseBody.fromString(jsonEncode({
      'draft': false, 'prerelease': false, 'tag_name': tag,
      'name': 'An unrelated display title', 'version': '99.0.0', 'assets': [],
    }), 200, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
  }
  @override
  void close({bool force = false}) {}
}
void main() {
  test('Windows Installer receives native MSI and log paths', () {
    final dir = Directory(r'C:\Users\Test User\Downloads\update');
    final args = helper.installerArguments(dir, 'update');
    expect(args[1], '${dir.path}${Platform.pathSeparator}update.msi');
    expect(args[5], '${dir.path}${Platform.pathSeparator}install.log');
    expect(args.contains('REINSTALL=ALL'), isFalse);
    expect(helper.installerArguments(dir, 'reinstall'), contains('REINSTALL=ALL'));
  });
  late LatestReleaseAdapter adapter;
  setUp(() {adapter = LatestReleaseAdapter(); helper.dio.httpClientAdapter = adapter;});
  test('equal build is current regardless of title or installer version', () async {
    expect((await helper.release('update', '2'))['stage'], 'up_to_date');
    expect(adapter.routes.single, endsWith('/releases/latest'));
  });
  test('higher build is recognized but unsigned installer is rejected', () async {
    await expectLater(helper.release('update', '0'), throwsA(isA<FormatException>().having((e)=>e.message, 'message', contains('verified Windows MSI'))));
  });
  test('reinstall only queries latest and refuses downgrade', () async {
    await expectLater(helper.release('reinstall', '3'), throwsA(isA<FormatException>().having((e)=>e.message, 'message', contains('older'))));
    expect(adapter.routes.single, endsWith('/releases/latest'));
  });
  test('legacy version tag produces an actionable error', () async {
    adapter.tag = 'v2.0.0';
    await expectLater(helper.release('update', '0'), throwsA(isA<FormatException>().having((e)=>e.message, 'message', contains('numeric build numbers'))));
  });
}
