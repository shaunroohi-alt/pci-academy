#pragma once
#include <cmath>

namespace lm2::dsp
{
/** Minimal transposed-direct-form-II biquad in double precision. */
struct Biquad
{
    double b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0;
    double z1 = 0.0, z2 = 0.0;

    void reset() noexcept { z1 = z2 = 0.0; }

    inline double process (double x) noexcept
    {
        const double y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }

    /** 2nd-order Butterworth-style high-pass (RBJ cookbook). */
    void setHighPass (double sampleRate, double freq, double q) noexcept
    {
        const double w0 = 2.0 * M_PI * freq / sampleRate;
        const double cs = std::cos (w0), sn = std::sin (w0);
        const double alpha = sn / (2.0 * q);
        const double a0 = 1.0 + alpha;
        b0 = ((1.0 + cs) * 0.5) / a0;
        b1 = (-(1.0 + cs)) / a0;
        b2 = ((1.0 + cs) * 0.5) / a0;
        a1 = (-2.0 * cs) / a0;
        a2 = (1.0 - alpha) / a0;
    }

    /** Peaking EQ (RBJ cookbook). */
    void setPeak (double sampleRate, double freq, double q, double gainDb) noexcept
    {
        const double A  = std::pow (10.0, gainDb / 40.0);
        const double w0 = 2.0 * M_PI * freq / sampleRate;
        const double cs = std::cos (w0), sn = std::sin (w0);
        const double alpha = sn / (2.0 * q);
        const double a0 = 1.0 + alpha / A;
        b0 = (1.0 + alpha * A) / a0;
        b1 = (-2.0 * cs) / a0;
        b2 = (1.0 - alpha * A) / a0;
        a1 = (-2.0 * cs) / a0;
        a2 = (1.0 - alpha / A) / a0;
    }

    /** Low shelf (RBJ cookbook). */
    void setLowShelf (double sampleRate, double freq, double q, double gainDb) noexcept
    {
        const double A  = std::pow (10.0, gainDb / 40.0);
        const double w0 = 2.0 * M_PI * freq / sampleRate;
        const double cs = std::cos (w0), sn = std::sin (w0);
        const double alpha = sn / (2.0 * q);
        const double sqA2a = 2.0 * std::sqrt (A) * alpha;
        const double a0 = (A + 1.0) + (A - 1.0) * cs + sqA2a;
        b0 = (A * ((A + 1.0) - (A - 1.0) * cs + sqA2a)) / a0;
        b1 = (2.0 * A * ((A - 1.0) - (A + 1.0) * cs)) / a0;
        b2 = (A * ((A + 1.0) - (A - 1.0) * cs - sqA2a)) / a0;
        a1 = (-2.0 * ((A - 1.0) + (A + 1.0) * cs)) / a0;
        a2 = ((A + 1.0) + (A - 1.0) * cs - sqA2a) / a0;
    }
};
} // namespace lm2::dsp
