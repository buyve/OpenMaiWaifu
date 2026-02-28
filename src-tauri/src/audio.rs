//! System audio level monitoring via `cpal`.
//!
//! Uses the default input device to capture audio samples and compute
//! an RMS level. The stream is kept alive by leaking it into static
//! memory (it runs for the lifetime of the application).

use std::sync::atomic::{AtomicU32, Ordering};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

/// Shared atomic holding the current audio level as f32 bits (0.0 - 1.0).
static AUDIO_LEVEL: AtomicU32 = AtomicU32::new(0);

/// Start monitoring system audio input level.
/// The stream is intentionally leaked to keep it alive for the app's lifetime.
/// Returns `true` if monitoring started successfully.
pub fn start_audio_monitoring() -> bool {
    let host = cpal::default_host();

    // Use default input device (microphone / system audio capture)
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            eprintln!("[audio] No input device found");
            return false;
        }
    };

    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[audio] No input config available: {e}");
            return false;
        }
    };

    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            process_f32,
            |err| eprintln!("[audio] Stream error: {err}"),
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            process_i16,
            |err| eprintln!("[audio] Stream error: {err}"),
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            process_u16,
            |err| eprintln!("[audio] Stream error: {err}"),
            None,
        ),
        _ => {
            eprintln!("[audio] Unsupported sample format: {sample_format:?}");
            return false;
        }
    };

    match stream {
        Ok(s) => {
            if let Err(e) = s.play() {
                eprintln!("[audio] Failed to start stream: {e}");
                return false;
            }
            // Intentionally leak the stream so it stays alive for the entire process.
            // cpal::Stream is !Send on macOS, so we can't move it to another thread.
            std::mem::forget(s);
            true
        }
        Err(e) => {
            eprintln!("[audio] Failed to build stream: {e}");
            false
        }
    }
}

fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / samples.len() as f32).sqrt().min(1.0)
}

fn store_level(rms: f32) {
    // Exponential smoothing: 90% old + 10% new
    let old = f32::from_bits(AUDIO_LEVEL.load(Ordering::Relaxed));
    let smoothed = old * 0.9 + rms * 0.1;
    AUDIO_LEVEL.store(smoothed.to_bits(), Ordering::Relaxed);
}

fn process_f32(data: &[f32], _: &cpal::InputCallbackInfo) {
    store_level(compute_rms(data));
}

fn process_i16(data: &[i16], _: &cpal::InputCallbackInfo) {
    let floats: Vec<f32> = data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
    store_level(compute_rms(&floats));
}

fn process_u16(data: &[u16], _: &cpal::InputCallbackInfo) {
    let floats: Vec<f32> = data
        .iter()
        .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
        .collect();
    store_level(compute_rms(&floats));
}

/// Get the current audio level (0.0 - 1.0 RMS).
#[tauri::command]
pub fn get_audio_level() -> f32 {
    f32::from_bits(AUDIO_LEVEL.load(Ordering::Relaxed))
}
