#[tokio::main]
async fn main() -> std::process::ExitCode {
    match novel_gui_lib::cli::run().await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Error: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
