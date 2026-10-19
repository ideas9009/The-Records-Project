import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'package:dio/dio.dart';
import '../lib/release.dart';

bool handedOff = false;
void emit(Map<String, dynamic> value) => stdout.writeln(jsonEncode(value));
final dio = Dio(BaseOptions(
    headers: {
      'User-Agent': 'TheRecordsProject-Updater',
      'Accept': 'application/vnd.github+json'
    },
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 60)));
String githubAsset(Map<String, dynamic> release, String name) {
  final assets =
      (release['assets'] as List).where((a) => a['name'] == name).toList();
  if (assets.length != 1)
    throw const FormatException(
        'This release has no complete, verified Windows MSI yet.');
  final url = assets.single['browser_download_url'] as String;
  if (!url.startsWith('https://github.com/$repository/releases/download/'))
    throw const FormatException('Unexpected release download location.');
  return url;
}

Future<Map<String, dynamic>> release(String mode, String current) async {
  stableVersion(current);
  final route = mode == 'reinstall' ? 'tags/v$current' : 'latest';
  Response response;
  try {
    response = await dio
        .get('https://api.github.com/repos/$repository/releases/$route');
  } on DioException catch (e) {
    if (e.response?.statusCode == 404)
      throw const FormatException(
          'No Windows MSI release has been published yet.');
    rethrow;
  }
  final r = response.data as Map<String, dynamic>;
  if (r['draft'] != false || r['prerelease'] != false)
    throw const FormatException('This is not a stable release.');
  final tag = r['tag_name'] as String;
  if (!tag.startsWith('v'))
    throw const FormatException(
        'The release tag must use v followed by its version.');
  final version = tag.substring(1),
      latest = stableVersion(version),
      installed = stableVersion(current);
  if (mode == 'reinstall' && latest != installed)
    throw const FormatException('No matching reinstall is available.');
  if (mode != 'reinstall' && latest <= installed)
    return {
      'stage': 'up_to_date',
      'current': current,
      'message': 'You are up to date.'
    };
  final meta = await dio.get<List<int>>(githubAsset(r, manifestName),
      options: Options(responseType: ResponseType.bytes));
  final sig = await dio.get<String>(githubAsset(r, '$manifestName.sig'),
      options: Options(responseType: ResponseType.plain));
  final manifest = await verifyManifest(meta.data!, sig.data!, version);
  if (githubAsset(r, manifest['filename']) != manifest['url'])
    throw const FormatException(
        'The signed installer does not match the release asset.');
  return {
    'stage': 'available',
    'version': version,
    'current': current,
    'notes': (r['body'] ?? '')
        .toString()
        .substring(0, (r['body'] ?? '').toString().length.clamp(0, 12000)),
    'manifest': manifest,
    'metadata': base64Encode(meta.data!),
    'signature': sig.data!
  };
}

Future<void> verifyFile(Directory dir, Map<String, dynamic> job) async {
  final manifest = await verifyManifest(
      base64Decode(job['metadata']), job['signature'], job['version']);
  final file = File('${dir.path}${Platform.pathSeparator}update.msi');
  if (await file.length() != manifest['size'] ||
      await hashStream(file.openRead()) != manifest['sha256'])
    throw const FormatException(
        'The MSI verification failed. Download it again.');
}

Future<void> install(Directory dir, int parent, String exe) async {
  final job = jsonDecode(await File('${dir.path}/job.json').readAsString())
      as Map<String, dynamic>;
  await verifyFile(dir, job);
  // Acquire a handle before notifying Tauri that it is safe to exit.
  final kernel = DynamicLibrary.open('kernel32.dll');
  final open = kernel.lookupFunction<
      Pointer<Void> Function(Uint32, Int32, Uint32),
      Pointer<Void> Function(int, int, int)>('OpenProcess');
  final wait = kernel.lookupFunction<Uint32 Function(Pointer<Void>, Uint32),
      int Function(Pointer<Void>, int)>('WaitForSingleObject');
  final close = kernel.lookupFunction<Int32 Function(Pointer<Void>),
      int Function(Pointer<Void>)>('CloseHandle');
  final handle = open(0x00100000, 0, parent);
  if (handle == nullptr)
    throw const FormatException('Cannot wait for the running app to close.');
  emit({
    'stage': 'installing',
    'message': 'Installing. The app will reopen when finished.'
  });
  await stdout.flush();
  handedOff = true;
  try {
    if (wait(handle, 60000) != 0)
      throw const FormatException('The app did not close in time.');
  } finally {
    close(handle);
  }
  final system = Platform.environment['SystemRoot'] ?? r'C:\Windows';
  final args = [
    '/i',
    '${dir.path}/update.msi',
    '/passive',
    '/norestart',
    '/L*v',
    '${dir.path}/install.log',
    if (job['mode'] == 'reinstall') ...['REINSTALL=ALL', 'REINSTALLMODE=vomus']
  ];
  final result = await Process.run('$system/System32/msiexec.exe', args);
  if (result.exitCode != 0 && result.exitCode != 3010) {
    await File('${dir.path}/error.txt').writeAsString(
        'Windows Installer failed (${result.exitCode}). See install.log.');
    await Process.start(exe, ['--update-failed'],
        mode: ProcessStartMode.detached);
    return;
  }
  await File('${dir.path}/result.json').writeAsString(
      jsonEncode({'success': true, 'rebootRequired': result.exitCode == 3010}));
  await Process.start(exe, [], mode: ProcessStartMode.detached);
  // Keep logs for diagnostics; remove the large installer only after success.
  await File('${dir.path}/update.msi').delete();
}

Future<void> main(List<String> args) async {
  try {
    if (!Platform.isWindows)
      throw const FormatException('This updater is for Windows.');
    if (args[0] == 'install') {
      await install(Directory(args[1]), int.parse(args[2]), args[3]);
      return;
    }
    final current = args[1], mode = args.length > 2 ? args[2] : 'update';
    if (!['update', 'reinstall'].contains(mode))
      throw const FormatException('Invalid update action.');
    final info = await release(mode, current);
    if (args[0] == 'check' || info['stage'] == 'up_to_date') {
      info.remove('manifest');
      info.remove('metadata');
      info.remove('signature');
      emit(info);
      return;
    }
    if (args[0] != 'prepare')
      throw const FormatException('Invalid updater action.');
    final dir = Directory(args[3]),
        manifest = info['manifest'] as Map<String, dynamic>;
    final partial = File('${dir.path}/update.partial');
    final cancel = CancelToken();
    var last = DateTime.fromMillisecondsSinceEpoch(0);
    try {
      await dio.download(manifest['url'], partial.path, cancelToken: cancel,
          onReceiveProgress: (received, total) {
        if (received > manifest['size'])
          cancel.cancel('The installer exceeds its signed size.');
        if (DateTime.now().difference(last).inMilliseconds > 150) {
          last = DateTime.now();
          emit({
            'stage': 'downloading',
            'version': info['version'],
            'received': received,
            'total': manifest['size']
          });
        }
      });
      emit({'stage': 'verifying', 'version': info['version']});
      if (await partial.length() != manifest['size'] ||
          await hashStream(partial.openRead()) != manifest['sha256'])
        throw const FormatException(
            'The MSI verification failed. No installation was attempted.');
      await partial.rename('${dir.path}/update.msi');
      await File('${dir.path}/job.json').writeAsString(jsonEncode({
        'mode': mode,
        'version': info['version'],
        'metadata': info['metadata'],
        'signature': info['signature']
      }));
      emit({
        'stage': 'ready',
        'version': info['version'],
        'message': 'Verified and ready to install.',
        'reinstall': mode == 'reinstall'
      });
    } catch (_) {
      if (await partial.exists()) await partial.delete();
      rethrow;
    }
  } catch (e) {
    if (handedOff && args.length > 3) {
      try {
        await Process.start(args[3], ['--update-failed'],
            mode: ProcessStartMode.detached);
      } catch (_) {}
    }
    var message = e is FormatException
        ? e.message
        : e is DioException
            ? 'Could not reach GitHub. Check your connection and try again.'
            : 'The updater could not finish. Please try again.';
    emit({'stage': 'error', 'message': message});
    exitCode = 1;
  }
}
