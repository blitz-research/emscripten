#include <assert.h>
#include <stdio.h>

#define MAX_SAFE_INTEGER ((1ll<<53)-1)
#define MIN_SAFE_INTEGER (-MAX_SAFE_INTEGER)

int64_t jscall(int64_t arg);

void check_ok(int64_t val) {
  printf("checking: %lld\n", val);
  int64_t rtn = jscall(val);
  int64_t expected = val/2;
  printf("got:      %lld\n", rtn);
  printf("expected: %lld\n", expected);
  assert(rtn == expected);
}

void check_invalid(int64_t val) {
  printf("checking: %lld\n", val);
  int64_t rtn = jscall(val);
  printf("got:      %lld\n", rtn);
  assert(rtn == 0);
}

int main() {
  check_ok(42);
  check_ok(MAX_SAFE_INTEGER/2);
  check_ok(MIN_SAFE_INTEGER/2);
  check_ok(MAX_SAFE_INTEGER);
  check_ok(MIN_SAFE_INTEGER);
  check_invalid(MAX_SAFE_INTEGER + 1);
  check_invalid(MIN_SAFE_INTEGER - 1);
  printf("done\n");
  return 0;
}
