package main

import (
	"net"
	"testing"
)

func TestEnsurePortClosed(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := ensurePortClosed(port); err == nil {
		t.Fatal("accepted running service")
	}
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	if err := ensurePortClosed(port); err != nil {
		t.Fatalf("rejected closed port: %v", err)
	}
	if err := ensurePortClosed(0); err == nil {
		t.Fatal("accepted invalid port")
	}
}
func TestOperatorAttestationIsRequired(t *testing.T) {
	if err := run([]string{"-action=prepare", "-user-id=user"}); err == nil {
		t.Fatal("accepted cleanup without stopped-services attestation")
	}
	if err := run([]string{"-single-host-services-stopped", "-action=activate"}); err == nil {
		t.Fatal("accepted activation without operation or assertion lifetime")
	}
}
