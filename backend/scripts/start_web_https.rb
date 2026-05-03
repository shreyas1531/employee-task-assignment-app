#!/usr/bin/env ruby

require "openssl"
require "rack"
require "rack/handler/webrick"
require "webrick"
require_relative "../app"

host = ENV.fetch("APP_HOST", "0.0.0.0")
port = Integer(ENV.fetch("APP_PORT", ENV.fetch("PORT", "8443")))
cert_path = ENV.fetch("HTTPS_CERT_FILE")
key_path = ENV.fetch("HTTPS_KEY_FILE")

certificate = OpenSSL::X509::Certificate.new(File.read(cert_path))
private_key = OpenSSL::PKey::RSA.new(File.read(key_path))

Rack::Handler::WEBrick.run(
  TaskAssignmentAPI.new,
  Host: host,
  Port: port,
  SSLEnable: true,
  SSLCertificate: certificate,
  SSLPrivateKey: private_key,
  SSLVerifyClient: OpenSSL::SSL::VERIFY_NONE,
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO),
  AccessLog: []
)
