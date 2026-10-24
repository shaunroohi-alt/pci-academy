#pragma once
#include <algorithm>
#include <vector>

namespace lm2::dsp
{
/** Integer sample delay line with exact semantics: a delay of 0 is a pass-through. */
class IntDelay
{
public:
    void prepare (int delaySamples)
    {
        delay = std::max (0, delaySamples);
        buffer.assign ((size_t) std::max (1, delay), 0.0f);
        pos = 0;
    }

    void reset() { std::fill (buffer.begin(), buffer.end(), 0.0f); pos = 0; }

    inline float process (float x) noexcept
    {
        if (delay == 0) return x;
        const float out = buffer[(size_t) pos];
        buffer[(size_t) pos] = x;
        if (++pos >= delay) pos = 0;
        return out;
    }

    int getDelay() const noexcept { return delay; }

private:
    std::vector<float> buffer { 0.0f };
    int delay = 0, pos = 0;
};
} // namespace lm2::dsp
