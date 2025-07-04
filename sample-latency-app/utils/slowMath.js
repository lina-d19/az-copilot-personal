// Inefficient math function to simulate CPU-bound latency
function slowCalculation(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += Math.sqrt(i * j);
    }
  }
  return sum;
}

module.exports = { slowCalculation };
