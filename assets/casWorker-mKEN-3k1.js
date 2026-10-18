const e=/* #__PURE__ */ Object.assign({"./python/mathlab/__init__.py":`"""Math Lab's Python side: SymPy-based calculus with checks and explanations."""
`,"./python/mathlab/antiderivatives.py":`"""Finding an antiderivative, with steps when the textbook rules can explain it.

Shared by indefinite, definite, and double integrals. The variable of
integration is x unless given; any other letters are treated as constants.
"""

import sympy

from mathlab.checks import (
    check_antiderivative,
    check_with_constants,
    test_values,
    undefined_where_function_is_defined,
)
from mathlab.expressions import X, InputError, with_absolute_value_logs
from mathlab.integral_steps import MAX_STEP_COUNT, explain_integral, find_integral_rule, rule_count
from mathlab.integral_strategies import integrate_with_one_angle
from mathlab.parsing import constants_in
from mathlab.progress import report


def checked(function, antiderivative, variable):
    """Check an antiderivative, with test values for any constants."""
    return check_with_constants(
        lambda f, F: check_antiderivative(f, F, variable), function, antiderivative, (variable,)
    )


def with_absolute_values_if_needed(function, antiderivative, variable=X):
    """Use ln|u| instead of ln(u) where ln(u) is undefined but the function is not.

    Returns the antiderivative to show and whether absolute values were added.
    """
    if not antiderivative.has(sympy.log):
        return antiderivative, False
    values = test_values(constants_in(function, (variable,)))
    if not undefined_where_function_is_defined(
        function.subs(values), antiderivative.subs(values), variable
    ):
        return antiderivative, False
    candidate = with_absolute_value_logs(antiderivative)
    if checked(function, candidate, variable)["status"] == "verified":
        return candidate, True
    return antiderivative, False


def find_antiderivative(function, variable=X, general=True):
    """Return (antiderivative, check, steps, steps_note).

    Strategies go from the most explainable to the most powerful, reporting
    each one, since hard integrals can take minutes. With general=False, the
    slow general algorithms are skipped, for callers that have a numerical
    answer to fall back on.
    """
    report("Trying the textbook rules (substitution, parts, partial fractions)…")
    found = find_integral_rule(function, variable)
    if found is not None:
        rule, antiderivative = found
        antiderivative, absolute_logs = with_absolute_values_if_needed(
            function, antiderivative, variable
        )
        check = checked(function, antiderivative, variable)
        if check["status"] != "failed":
            if rule_count(rule) > MAX_STEP_COUNT:
                return antiderivative, check, [], "This solution has too many steps to show."
            try:
                steps, steps_note = explain_integral(rule, absolute_logs), None
            except Exception:  # Steps are extra: a failure in them must not block the answer.
                steps, steps_note = [], "Steps couldn't be shown for this integral."
            return antiderivative, check, steps, steps_note
    # This rewrite is written for x, the Solver's usual variable.
    if variable == X:
        report("Rewriting the trig functions in terms of one angle…")
        rewritten = integrate_with_one_angle(function)
        if rewritten is not None:
            antiderivative, steps = rewritten
            antiderivative, _ = with_absolute_values_if_needed(function, antiderivative)
            check = checked(function, antiderivative, variable)
            if check["status"] != "failed":
                return antiderivative, check, steps, None
    if not general:
        raise InputError("No antiderivative was found with the textbook rules.")
    report("Trying SymPy's general algorithms (Risch, Meijer G). Hard integrals can take minutes…")
    antiderivative = sympy.integrate(function, variable)
    if antiderivative.has(sympy.Integral):
        raise InputError(
            "SymPy couldn't find an antiderivative for this function. "
            "Some functions have none that can be written with standard functions."
        )
    antiderivative, _ = with_absolute_values_if_needed(function, antiderivative, variable)
    return (
        antiderivative,
        checked(function, antiderivative, variable),
        [],
        "Steps aren't available: SymPy found this antiderivative with an advanced algorithm "
        "rather than the rules taught in calculus courses.",
    )
`,"./python/mathlab/calculus.py":`"""Calculus operations for the solver, run inside Pyodide (Python in the browser).\r
\r
The TypeScript side calls run_request() with a JSON string and gets a JSON\r
string back. SymPy does the math, every answer is checked independently\r
before it is shown, and answers come with step-by-step explanations when the\r
rules taught in calculus courses can produce them.\r
"""\r
\r
import json\r
\r
import mpmath\r
import sympy\r
\r
from mathlab.antiderivatives import find_antiderivative\r
from mathlab.checks import check_derivative, check_with_constants, numeric_function, plot_value\r
from mathlab.curves import analyze_curve, parse_curve_function, trace\r
from mathlab.definite import definite_integral\r
from mathlab.directional import direction_picture, directional_derivative, number\r
from mathlab.green import green, green_sweep\r
from mathlab.line_integrals import line_integral, line_trace\r
from mathlab.optimize import constraint_picture, optimize\r
from mathlab.tangent import tangent_picture, tangent_plane\r
from mathlab.derivative_steps import derivative_with_steps\r
from mathlab.double import double_integral\r
from mathlab.expressions import X, Y, Z, T, InputError, to_latex\r
from mathlab.latex_input import latex_to_text\r
from mathlab.multivariable import parse_point, partial_derivatives, slices\r
from mathlab.parsing import constants_in, parse_function\r
from mathlab.practice import check, practice\r
from mathlab.practice import solution as practice_solution\r
from mathlab.progress import listen\r
from mathlab.riemann import riemann_sum\r
from mathlab.solid import solid_picture\r
from mathlab.space_curves import analyze_space_curve, space_trace\r
from mathlab.triple import triple_integral\r
from mathlab.vectors import analyze_vectors, parse_vector\r
\r
GRAPH_X_MIN = -10.0\r
GRAPH_X_MAX = 10.0\r
GRAPH_POINT_COUNT = 801\r
\r
\r
def sample_for_graph(expression):\r
    as_numeric = numeric_function(expression)\r
    values = []\r
    for index in range(GRAPH_POINT_COUNT):\r
        point = GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1)\r
        values.append(plot_value(lambda: as_numeric(mpmath.mpf(point))))\r
    return values\r
\r
\r
def graph_x_values():\r
    return [\r
        round(GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1), 6)\r
        for index in range(GRAPH_POINT_COUNT)\r
    ]\r
\r
\r
def solution(operation, function, equation_latex, result, check, steps, steps_note):\r
    constants = constants_in(function, (X,))\r
    # With constants like a and b there is no single curve to draw.\r
    graph = None\r
    if not constants:\r
        graph = {\r
            "x": graph_x_values(),\r
            "input": sample_for_graph(function),\r
            "result": sample_for_graph(result),\r
        }\r
    return {\r
        "ok": True,\r
        "operation": operation,\r
        "equationLatex": equation_latex,\r
        "resultLatex": to_latex(result),\r
        "resultText": str(result),\r
        "constants": [to_latex(constant) for constant in constants],\r
        "check": check,\r
        "steps": steps,\r
        "stepsNote": steps_note,\r
        "graph": graph,\r
    }\r
\r
\r
def differentiate(function):\r
    derivative, steps, steps_note = derivative_with_steps(function)\r
    equation = rf"\\frac{{d}}{{dx}}\\left[{to_latex(function)}\\right] = {to_latex(derivative)}"\r
    check = check_with_constants(check_derivative, function, derivative)\r
    return solution("differentiate", function, equation, derivative, check, steps, steps_note)\r
\r
\r
def integral_solution(function, antiderivative, check, steps, steps_note):\r
    equation = f"{to_latex(sympy.Integral(function, X))} = {to_latex(antiderivative)} + C"\r
    return solution("integrate", function, equation, antiderivative, check, steps, steps_note)\r
\r
\r
def integrate(function):\r
    return integral_solution(function, *find_antiderivative(function))\r
\r
\r
def expression_text(request):\r
    """The request's expression as plain text. The math input box sends LaTeX."""\r
    expression = request.get("expression", "")\r
    return latex_to_text(expression) if request.get("format") == "latex" else expression\r
\r
\r
def preview(request):\r
    """How the input reads as math, shown while the student types."""\r
    variables = {("x", "y"): (X, Y), ("x", "y", "z"): (X, Y, Z)}.get(\r
        tuple(request.get("variables") or ()), (X,)\r
    )\r
    function = parse_function(expression_text(request), variables)\r
    return {\r
        "ok": True,\r
        "operation": "preview",\r
        "latex": to_latex(function),\r
        "constants": [to_latex(constant) for constant in constants_in(function, variables)],\r
    }\r
\r
\r
def solid_bounds(request):\r
    """A triple integral's bounds as (lower, upper) LaTeX pairs, innermost first:\r
    the innermost may use the two other variables, the middle the outermost one."""\r
    return (\r
        (request.get("innerLower"), request.get("innerUpper")),\r
        (request.get("middleLower"), request.get("middleUpper")),\r
        (request.get("lower"), request.get("upper")),\r
    )\r
\r
\r
def constraint_function(request):\r
    """The constraint g, from its math box, or None when the box is empty."""\r
    text = request.get("constraintLatex")\r
    if not isinstance(text, str) or text.strip() == "":\r
        return None\r
    try:\r
        return parse_function(latex_to_text(text), (X, Y, Z))\r
    except InputError as error:\r
        raise InputError(f"g: {error}") from error\r
\r
\r
def constraint_picture_request(request):\r
    return constraint_picture(\r
        parse_function(expression_text(request), (X, Y)),\r
        constraint_function(request),\r
        parse_curve_function(request.get("xExpression"), "x(t)", T),\r
        parse_curve_function(request.get("yExpression"), "y(t)", T),\r
        (number(request.get("lower"), "start of t"), number(request.get("upper"), "end of t")),\r
        int(request.get("positionCount") or 72),\r
    )\r
\r
\r
OPERATIONS = {\r
    "preview": preview,\r
    "differentiate": lambda request: differentiate(parse_function(expression_text(request))),\r
    "integrate": lambda request: integrate(parse_function(expression_text(request))),\r
    # The bounds come from math boxes too, as LaTeX.\r
    "definite": lambda request: definite_integral(\r
        parse_function(expression_text(request)), request.get("lower"), request.get("upper")\r
    ),\r
    # Inside bounds may depend on the outside variable; all bounds are LaTeX.\r
    "double": lambda request: double_integral(\r
        parse_function(expression_text(request), (X, Y)),\r
        request.get("order"),\r
        (request.get("innerLower"), request.get("innerUpper")),\r
        (request.get("lower"), request.get("upper")),\r
    ),\r
    "triple": lambda request: triple_integral(\r
        parse_function(expression_text(request), (X, Y, Z)),\r
        request.get("order"),\r
        solid_bounds(request),\r
        request.get("coordinates") or "rectangular",\r
    ),\r
    # The triple-integrals lesson picture: the same bounds, with f = 1.\r
    "solid": lambda request: solid_picture(request.get("order"), solid_bounds(request)),\r
    "partial": lambda request: partial_derivatives(\r
        parse_function(expression_text(request), (X, Y)), parse_point(request.get("point"))\r
    ),\r
    # Vector components are short plain-text numbers, like -1/2 or sqrt(3).\r
    "vectors": lambda request: analyze_vectors(\r
        parse_vector(request.get("a"), "a"), parse_vector(request.get("b"), "b")\r
    ),\r
    "slices": lambda request: slices(\r
        parse_function(expression_text(request), (X, Y)), parse_point(request.get("point"))\r
    ),\r
    # The rectangle's bounds are LaTeX, like the other bounds.\r
    "riemann": lambda request: riemann_sum(\r
        parse_function(expression_text(request), (X, Y)),\r
        request.get("rectangle"),\r
        request.get("divisions"),\r
        request.get("sample"),\r
    ),\r
    "curve": analyze_curve,\r
    # The parametric and polar curves lesson picture.\r
    "trace": trace,\r
    "space": analyze_space_curve,\r
    # The space curves lesson picture.\r
    "spaceTrace": space_trace,\r
    # Point coordinates and direction components are LaTeX from math boxes.\r
    "directional": lambda request: directional_derivative(\r
        parse_function(expression_text(request), (X, Y, Z)),\r
        request.get("pointLatex"),\r
        request.get("direction"),\r
    ),\r
    # The directional derivatives lesson picture.\r
    "directions": lambda request: direction_picture(\r
        parse_function(expression_text(request), (X, Y, Z)), request.get("pointLatex")\r
    ),\r
    # Point coordinates are LaTeX from math boxes; near is an optional nearby\r
    # point for a linear approximation.\r
    "tangent": lambda request: tangent_plane(\r
        parse_function(expression_text(request), (X, Y, Z)),\r
        request.get("tangentKind"),\r
        request.get("pointLatex"),\r
        request.get("nearLatex"),\r
    ),\r
    # The tangent planes lesson picture.\r
    "tangentPicture": lambda request: tangent_picture(\r
        parse_function(expression_text(request), (X, Y))\r
    ),\r
    # Critical points of f(x, y), or extreme values of f on g = k; the\r
    # constraint g and its value k are LaTeX from math boxes.\r
    "optimize": lambda request: optimize(\r
        parse_function(expression_text(request), (X, Y, Z)),\r
        request.get("optimizeKind"),\r
        constraint_function(request),\r
        request.get("level"),\r
    ),\r
    # The optimization lesson picture: f on a constraint curve given by x(t), y(t).\r
    "constraintPicture": constraint_picture_request,\r
    # Curve components, field components, and f are LaTeX from math boxes.\r
    "line": line_integral,\r
    # The line integrals lesson picture.\r
    "lineTrace": line_trace,\r
    # F = <P, Q> and a region D described like a double integral's (dy dx or\r
    # dx dy), or in polar coordinates; all LaTeX from math boxes.\r
    "green": green,\r
    # The Green's theorem lesson picture.\r
    "greenSweep": green_sweep,\r
    "practice": practice,\r
    "check": check,\r
    "solution": practice_solution,\r
}\r
\r
\r
def run_request(request_json, on_progress=None):\r
    """Entry point from TypeScript. Takes and returns JSON strings.\r
\r
    on_progress, if given, is called with short messages about what a long\r
    calculation is trying.\r
    """\r
    request = json.loads(request_json)\r
    listen(on_progress)\r
    try:\r
        operation = OPERATIONS.get(request.get("operation"))\r
        if operation is None:\r
            raise InputError(f"Unknown operation: {request.get('operation')}")\r
        response = operation(request)\r
    except InputError as error:\r
        response = {"ok": False, "error": str(error)}\r
    except Exception as error:  # Report any SymPy failure instead of crashing the worker.\r
        response = {"ok": False, "error": f"SymPy couldn't finish this calculation ({type(error).__name__})."}\r
    finally:\r
        listen(None)\r
    return json.dumps(response, allow_nan=False)\r
`,"./python/mathlab/checks.py":`"""Independent numerical checks of answers, so a wrong answer is flagged."""

import itertools
import math

import mpmath
import sympy

from mathlab.expressions import X, Y, to_latex

# Points where answers are checked. They avoid 0, integers, and common
# singularities such as pi/2 so that most functions are defined at most of them.
CHECK_POINTS = (-2.37, -1.29, -0.53, 0.31, 0.87, 1.67, 2.61)
# (x, y) points for functions of two variables, in all four quadrants.
CHECK_POINTS_2D = tuple(zip(CHECK_POINTS, (1.13, -0.71, 2.07, -1.83, 0.47, -2.29, 1.59)))
MIN_CHECK_POINTS = 3
CHECK_PRECISION_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")

# Values tried for constants like a and b. Checks need numbers, so an answer
# with constants is checked with these plugged in. They avoid 0 and 1, which
# can hide mistakes.
CONSTANT_TEST_VALUES = (1.37, 0.73, 2.19, 1.61, 0.58, 2.83, 1.17, 0.91)

# Expressions larger than this are not passed to sympy.simplify, which can be slow.
MAX_SIMPLIFY_SIZE = 40


def test_values(constants):
    """Numbers to substitute for constants (in order), for checking answers."""
    return {
        constant: sympy.Rational(str(value))
        for constant, value in zip(constants, itertools.cycle(CONSTANT_TEST_VALUES))
    }


def check_with_constants(check, function, result, variables=(X,)):
    """Run check(function, result). Checks need numbers, so any constants
    (like a and b) get test values, and the detail says which."""
    constants = sorted(function.free_symbols - set(variables), key=str)
    if not constants:
        return check(function, result)
    values = test_values(constants)
    outcome = check(function.subs(values), result.subs(values))
    settings = ", ".join(f"\${to_latex(constant)} = {float(value):g}$" for constant, value in values.items())
    return {**outcome, "detail": f"{outcome['detail']} (Checked with {settings}.)"}


def numeric_function(expression, variables=(X,)):
    return sympy.lambdify(variables, expression, modules="mpmath")


def real_value(compute):
    """Run compute() and return its value as a real mpf, or None if it is not a finite real number."""
    try:
        value = mpmath.mpmathify(compute())
    except Exception:  # Undefined points raise many error types; all mean "no value here".
        return None
    if isinstance(value, mpmath.mpc):
        if abs(value.imag) > CHECK_TOLERANCE * max(1, abs(value.real)):
            return None
        value = value.real
    if not mpmath.isfinite(value):
        return None
    return value


def check_points_for(variables):
    return CHECK_POINTS_2D if len(variables) == 2 else tuple((point,) for point in CHECK_POINTS)


def plot_value(compute):
    """compute()'s value as a float for a graph, or None where there is no real value."""
    value = real_value(compute)
    if value is None:
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def compare_at_check_points(expected, actual, variables=(X,)):
    """Count the check points where expected and actual agree and disagree.

    Both are numeric functions of the variables. Points where either side has
    no real value are skipped.
    """
    agreed = disagreed = 0
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        for point in check_points_for(variables):
            coordinates = [mpmath.mpf(coordinate) for coordinate in point]
            expected_value = real_value(lambda: expected(*coordinates))
            actual_value = real_value(lambda: actual(*coordinates))
            if expected_value is None or actual_value is None:
                continue
            scale = max(1, abs(expected_value), abs(actual_value))
            if abs(expected_value - actual_value) <= CHECK_TOLERANCE * scale:
                agreed += 1
            else:
                disagreed += 1
    return agreed, disagreed


def agree_numerically(first, second, variables=(X,)):
    """True when two expressions have the same value at every check point."""
    _, disagreed = compare_at_check_points(
        numeric_function(first, variables), numeric_function(second, variables), variables
    )
    return disagreed == 0


def numeric_check(agreed, disagreed, verified_detail, failed_detail):
    if disagreed > 0:
        return {"status": "failed", "detail": failed_detail}
    if agreed >= MIN_CHECK_POINTS:
        return {"status": "verified", "detail": verified_detail.format(count=agreed)}
    return {
        "status": "unchecked",
        "detail": "Couldn't test this answer: the function isn't defined at enough test points.",
    }


def check_derivative(function, derivative):
    as_numeric = numeric_function(function)
    agreed, disagreed = compare_at_check_points(
        lambda point: mpmath.diff(as_numeric, point),
        numeric_function(derivative),
    )
    return numeric_check(
        agreed,
        disagreed,
        "Matches a high-precision numerical derivative at {count} test points.",
        "Doesn't match a numerical derivative. Don't trust this answer.",
    )


def check_partial_derivative(function, derivative, variable):
    """Compare with a numerical partial derivative: vary one coordinate, hold the other."""
    variables = (X, Y)
    index = variables.index(variable)
    as_numeric = numeric_function(function, variables)

    def numerical_partial(*point):
        def along_variable(value):
            coordinates = list(point)
            coordinates[index] = value
            return as_numeric(*coordinates)

        return mpmath.diff(along_variable, point[index])

    agreed, disagreed = compare_at_check_points(
        numerical_partial, numeric_function(derivative, variables), variables
    )
    return numeric_check(
        agreed,
        disagreed,
        "Matches a high-precision numerical partial derivative at {count} test points.",
        "Doesn't match a numerical partial derivative. Don't trust this answer.",
    )


def check_antiderivative(function, antiderivative, variable=X):
    derivative = sympy.diff(antiderivative, variable)
    difference = derivative - function
    if sympy.count_ops(difference) <= MAX_SIMPLIFY_SIZE and sympy.simplify(difference) == 0:
        return {
            "status": "verified",
            "detail": "Differentiating the answer gives back your function exactly.",
        }
    variables = (variable,)
    agreed, disagreed = compare_at_check_points(
        numeric_function(function, variables), numeric_function(derivative, variables), variables
    )
    return numeric_check(
        agreed,
        disagreed,
        "Differentiating the answer matches your function at {count} test points.",
        "Differentiating the answer doesn't give back your function. Don't trust this answer.",
    )


def undefined_where_function_is_defined(function, antiderivative, variable=X):
    as_numeric = numeric_function(function, (variable,))
    antiderivative_numeric = numeric_function(antiderivative, (variable,))
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        return any(
            real_value(lambda: as_numeric(mpmath.mpf(point))) is not None
            and real_value(lambda: antiderivative_numeric(mpmath.mpf(point))) is None
            for point in CHECK_POINTS
        )
`,"./python/mathlab/curves.py":`"""Parametric and polar curves: the slope, arc length, and area.

A parametric curve is x = x(t), y = y(t) for a ≤ t ≤ b. A polar curve
r = r(θ) is the parametric curve x = r cos θ, y = r sin θ with θ as the
parameter, so both use the same slope and length formulas. Their areas
differ: ∫ y dx under a parametric curve, ½∫ r² dθ inside a polar one.

Arc length integrands, √((dx/dt)² + (dy/dt)²), rarely have antiderivatives,
so only the textbook rules are tried (the general algorithms can run for
minutes); textbook examples are built so that the square root simplifies,
often with a half-angle identity. When no exact length is found, it is
computed numerically and labeled that way.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function
from mathlab.definite import evaluate_between, parse_bound
from mathlab.double import antiderivative_step
from mathlab.expressions import THETA, T, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number
from mathlab.steps import make_step, separate

CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
GRAPH_POINTS = 401
# An exact arc length is tried only for integrands with at most this many
# operations. Textbook ones are short once simplified (measured: 4 for a
# cycloid arch's 2|sin(t/2)|, 9 for the cardioid's, at most 9 in all); the
# speed of ⟨1 + t³, te⁻ᵗ, sin 2t⟩ has 15, and the textbook rules spent six
# seconds on it before failing.
EXACT_LENGTH_LIMIT = 12


def parse_curve_function(text, name, parameter):
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter {name}.")
    try:
        function = parse_function(latex_to_text(text), (parameter,))
    except InputError as error:
        raise InputError(f"{name}: {error}") from error
    constants = constants_in(function, (parameter,))
    if constants:
        raise InputError(
            f"{name} must use only {to_text(parameter)}, so the answers are numbers. "
            f"Remove {', '.join(str(constant) for constant in constants)}."
        )
    return function


def to_text(parameter):
    return "θ" if parameter == THETA else "t"


def parse_interval(lower_text, upper_text, parameter):
    low, high = (
        parse_bound(text, f"{name} {to_text(parameter)}")
        for text, name in ((lower_text, "starting"), (upper_text, "ending"))
    )
    if low.is_infinite or high.is_infinite:
        raise InputError("The interval must be finite, so the curve has a beginning and an end.")
    if not (high - low).is_positive:
        raise InputError(f"The starting {to_text(parameter)} must be less than the ending one.")
    return low, high


def latex_value(value):
    """value in LaTeX, with a decimal after it when it isn't a whole number or fraction."""
    text = to_latex(value)
    if not value.is_Rational:
        number = sympy.N(value, 15)
        if number.is_real:
            text += rf" \\approx {mpmath.nstr(mpmath.mpf(str(number)), 6)}"
    return text


# ---------------------------------------------------------------- the slope


def slope_steps(curve):
    """dy/dx and d²y/dx², and the slope at the chosen point if there is one."""
    p, dxdt, dydt = curve["parameter"], curve["dxdt"], curve["dydt"]
    name = to_latex(p)
    slope = sympy.simplify(dydt / dxdt)
    if curve["kind"] == "polar":
        r, drdtheta = curve["r"], sympy.diff(curve["r"], p)
        slope_step = make_step(
            "Slope of a polar curve",
            r"A polar curve is the parametric curve $x = r\\cos\\theta$, $y = r\\sin\\theta$, with "
            r"$\\theta$ as the parameter. Differentiate both with the product rule, then divide.",
            [
                r"\\frac{dy}{dx} = \\frac{dy/d\\theta}{dx/d\\theta} = "
                r"\\frac{\\frac{dr}{d\\theta}\\sin\\theta + r\\cos\\theta}"
                r"{\\frac{dr}{d\\theta}\\cos\\theta - r\\sin\\theta}",
                rf"\\frac{{\\left({to_latex(drdtheta)}\\right)\\sin\\theta + \\left({to_latex(r)}\\right)\\cos\\theta}}"
                rf"{{\\left({to_latex(drdtheta)}\\right)\\cos\\theta - \\left({to_latex(r)}\\right)\\sin\\theta}}",
                to_latex(slope),
            ],
        )
    else:
        slope_step = make_step(
            "Slope of a parametric curve",
            rf"By the chain rule, $\\frac{{dy}}{{d{name}}} = \\frac{{dy}}{{dx}} \\cdot \\frac{{dx}}{{d{name}}}$, "
            rf"so wherever $\\frac{{dx}}{{d{name}}} \\ne 0$, divide.",
            [
                rf"\\frac{{dy}}{{dx}} = \\frac{{dy/d{name}}}{{dx/d{name}}}",
                rf"\\frac{{{to_latex(dydt)}}}{{{to_latex(dxdt)}}}",
                to_latex(slope),
            ],
        )
    second = sympy.simplify(sympy.diff(slope, p) / dxdt)
    second_step = make_step(
        "Second derivative of a parametric curve",
        rf"$\\frac{{d^2y}}{{dx^2}}$ is the derivative of $\\frac{{dy}}{{dx}}$ with respect to $x$, "
        rf"so differentiate the slope with respect to \${name}$ and divide by "
        rf"$\\frac{{dx}}{{d{name}}}$ again.",
        [
            rf"\\frac{{d^2y}}{{dx^2}} = \\frac{{\\frac{{d}}{{d{name}}}\\left(\\frac{{dy}}{{dx}}\\right)}}{{dx/d{name}}}",
            to_latex(second),
        ],
    )
    results = [
        {"label": "Slope", "latex": rf"\\frac{{dy}}{{dx}} = {to_latex(slope)}"},
        {"label": "Second derivative", "latex": rf"\\frac{{d^2y}}{{dx^2}} = {to_latex(second)}"},
    ]
    steps = [slope_step, second_step]
    if curve["at"] is not None:
        step, result = tangent_at(curve, curve["at"])
        steps.append(step)
        results.append(result)
    return steps, results


def tangent_at(curve, at):
    p = curve["parameter"]
    name = to_latex(p)
    x0, y0 = (sympy.simplify(coordinate.subs(p, at)) for coordinate in (curve["x"], curve["y"]))
    dx0, dy0 = (sympy.simplify(derivative.subs(p, at)) for derivative in (curve["dxdt"], curve["dydt"]))
    curve["point"] = (x0, y0, dx0, dy0)
    point = rf"\\left({to_latex(x0)}, {to_latex(y0)}\\right)"
    at_text = rf"{name} = {to_latex(at)}"
    if dx0 == 0 and dy0 == 0:
        explanation = rf"Both $\\frac{{dx}}{{d{name}}}$ and $\\frac{{dy}}{{d{name}}}$ are $0$ here, so the formula gives $\\frac{{0}}{{0}}$ and doesn't decide the slope."
        latex = r"\\frac{dy}{dx} \\text{ is undefined } \\left(\\tfrac{0}{0}\\right)"
    elif dx0 == 0:
        explanation = rf"$\\frac{{dx}}{{d{name}}} = 0$ but $\\frac{{dy}}{{d{name}}} \\ne 0$: the curve moves straight up or down here, so the tangent is vertical."
        latex = r"\\text{vertical tangent}"
    else:
        value = sympy.simplify(dy0 / dx0)
        explanation = (
            rf"Substitute \${to_latex(at)}$ for \${name}$ in $\\frac{{dy}}{{dx}}$. The curve is at "
            rf"\${point}$ there."
        )
        latex = rf"\\frac{{dy}}{{dx}} = {latex_value(value)}"
        if value == 0:
            explanation += " The slope is $0$, so the tangent is horizontal."
    # One chain: the slope at the point, the quotient of the rates there, its value.
    math = (
        [
            rf"\\left.\\frac{{dy}}{{dx}}\\right|_{{{at_text}}}",
            rf"\\frac{{{to_latex(dy0)}}}{{{to_latex(dx0)}}}",
            latex_value(sympy.simplify(dy0 / dx0)),
        ]
        if dx0 != 0
        else [latex]
    )
    step = make_step("Slope at a point", explanation, math)
    return step, {"label": "Slope at the point", "latex": rf"{at_text}: \\quad {latex}"}


# ------------------------------------------------------------ the arc length


def half_angle_form(speed_squared, parameter):
    """(c, g, identity) with √(speed²) = c |g|, from a half-angle identity, or None.

    1 − cos u = 2 sin²(u/2), 1 + cos u = 2 cos²(u/2), and
    1 ± sin u = (sin(u/2) ± cos(u/2))², each times a positive constant A.
    """
    a = sympy.Wild("a", exclude=[parameter])
    b = sympy.Wild("b", exclude=[parameter])
    u = sympy.Wild("u")
    for trig in (sympy.cos, sympy.sin):
        match = sympy.expand(speed_squared).match(a + b * trig(u))
        if not match or match[b] == 0 or not match[u].has(parameter) or not match[a].is_positive:
            continue
        amount, coefficient, angle = match[a], match[b], match[u]
        half = angle / 2
        if trig is sympy.cos and coefficient == -amount:
            return sympy.sqrt(2 * amount), sympy.sin(half), rf"1 - \\cos u = 2\\sin^2\\frac{{u}}{{2}}"
        if trig is sympy.cos and coefficient == amount:
            return sympy.sqrt(2 * amount), sympy.cos(half), rf"1 + \\cos u = 2\\cos^2\\frac{{u}}{{2}}"
        if trig is sympy.sin and coefficient == amount:
            return (
                sympy.sqrt(amount),
                sympy.sin(half) + sympy.cos(half),
                r"1 + \\sin u = \\left(\\sin\\frac{u}{2} + \\cos\\frac{u}{2}\\right)^2",
            )
        if trig is sympy.sin and coefficient == -amount:
            return (
                sympy.sqrt(amount),
                sympy.sin(half) - sympy.cos(half),
                r"1 - \\sin u = \\left(\\sin\\frac{u}{2} - \\cos\\frac{u}{2}\\right)^2",
            )
    return None


def sign_change_points(integrand, parameter, low, high):
    """Where the inside of each |·| in integrand is 0 strictly between low and high."""
    points = set()
    for absolute in integrand.atoms(sympy.Abs):
        zeros = sympy.solveset(absolute.args[0], parameter, sympy.Interval.open(low, high))
        if zeros is sympy.S.EmptySet:
            continue  # No sign change inside the interval.
        if not isinstance(zeros, sympy.FiniteSet):
            return None
        points.update(zeros)
    return sorted(points, key=lambda point: float(sympy.N(point)))


def without_absolute_values(integrand, parameter, low, high):
    """integrand on (low, high), where no |·| inside changes sign, without the |·|."""
    middle = (low + high) / 2
    replacements = {}
    for absolute in integrand.atoms(sympy.Abs):
        inside = absolute.args[0]
        sign = 1 if float(sympy.N(inside.subs(parameter, middle))) >= 0 else -1
        replacements[absolute] = sign * inside
    return integrand.xreplace(replacements)


def integrate_piece(integrand, parameter, low, high, general=False):
    """∫ integrand from low to high: the step and the value. Without general,
    only the textbook rules are tried, and InputError means they found no
    antiderivative."""
    antiderivative, _, steps, _ = find_antiderivative(integrand, parameter, general=general)
    math, value = evaluate_between(integrand, antiderivative, low, high, parameter)
    step = make_step(
        "Fundamental Theorem of Calculus",
        r"Find an antiderivative and subtract its values at the ends of the interval.",
        math,
        [antiderivative_step(integrand, parameter, antiderivative, steps)],
    )
    return step, value


def arc_length(curve):
    """The arc length: its step, its result for display, its check, and its exact
    value (None when it was only computed numerically)."""
    p, (low, high) = curve["parameter"], curve["interval"]
    name = to_latex(p)
    if curve["kind"] == "polar":
        r = curve["r"]
        speed_squared = sympy.simplify(r**2 + sympy.diff(r, p) ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{r^2 + \\left(\\frac{{dr}}{{d\\theta}}\\right)^2}}\\, d\\theta"
        )
        explanation = (
            r"For a polar curve, $\\left(\\frac{dx}{d\\theta}\\right)^2 + \\left(\\frac{dy}{d\\theta}\\right)^2 "
            r"= r^2 + \\left(\\frac{dr}{d\\theta}\\right)^2$, so the length is the integral of its square "
            r"root."
        )
    elif curve["kind"] == "space":
        speed_squared = sympy.simplify(curve["dxdt"] ** 2 + curve["dydt"] ** 2 + curve["dzdt"] ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} |\\mathbf{{r}}'({name})|\\, d{name} = "
            rf"\\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{x'^2 + y'^2 + z'^2}}\\, d{name}"
        )
        explanation = (
            rf"Over a short time $d{name}$ the point moves $\\sqrt{{dx^2 + dy^2 + dz^2}}$ (the "
            rf"Pythagorean theorem in space), so the length is the integral of the speed "
            rf"$|\\mathbf{{r}}'({name})|$."
        )
    else:
        speed_squared = sympy.simplify(curve["dxdt"] ** 2 + curve["dydt"] ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{\\left(\\frac{{dx}}{{d{name}}}\\right)^2 + \\left(\\frac{{dy}}{{d{name}}}\\right)^2}}\\, d{name}"
        )
        explanation = (
            rf"Over a short time $d{name}$ the point moves $\\sqrt{{dx^2 + dy^2}}$ (the Pythagorean "
            rf"theorem), so the length is the integral of its speed, $\\sqrt{{\\left(\\frac{{dx}}{{d{name}}}\\right)^2 + \\left(\\frac{{dy}}{{d{name}}}\\right)^2}}$."
        )
    substeps = []
    integrand = sympy.sqrt(speed_squared)
    form = half_angle_form(speed_squared, p)
    if form is not None:
        constant, inside, identity = form
        integrand = constant * sympy.Abs(inside)
        substeps.append(
            make_step(
                "Half-angle identity",
                rf"Use \${identity}$ to write the expression under the root as a perfect square. "
                r"The root of a square is an absolute value: $\\sqrt{g^2} = |g|$.",
                [rf"\\sqrt{{{to_latex(speed_squared)}}}", to_latex(integrand)],
            )
        )
    else:
        # Textbook curves are often built so that the speed squared is a
        # perfect square, like e^(2t) + e^(-2t) + 2 = (e^t + e^(-t))², which
        # factoring reveals. SymPy's simplify writes that one as
        # 2 cosh(2t) + 2, so it is also factored in exponentials.
        factored = min(
            (
                sympy.sqrt(sympy.factor(form))
                for form in (speed_squared, speed_squared.rewrite(sympy.exp))
            ),
            key=sympy.count_ops,
        )
        if sympy.count_ops(factored) < sympy.count_ops(integrand):
            integrand = factored
            substeps.append(
                make_step(
                    "Perfect square",
                    r"The expression under the root factors into a perfect square (times a square), "
                    r"so the root simplifies: $\\sqrt{g^2} = |g|$, which is just $g$ where $g > 0$.",
                    [rf"\\sqrt{{{to_latex(speed_squared)}}}", to_latex(integrand)],
                )
            )
    math = [formula, to_latex(sympy.Integral(integrand, (p, low, high)))]
    points = sign_change_points(integrand, p, low, high)
    ends = [low, *(points or []), high]
    value = None
    # Long integrands are left to numerical integration: the textbook rules can
    # spend many seconds on them and practically never succeed.
    if points is not None and sympy.count_ops(integrand) <= EXACT_LENGTH_LIMIT:
        piece_steps = []
        if points:
            piece_steps.append(
                make_step(
                    "Split where the sign changes",
                    r"$|g| = g$ where $g \\ge 0$ and $|g| = -g$ where $g < 0$, so split the interval "
                    rf"where the expression inside $|\\cdot|$ is $0$: at \${', '.join(to_latex(point) for point in points)}$.",
                    [],
                )
            )
        try:
            pieces = []
            for piece_low, piece_high in zip(ends, ends[1:]):
                piece = without_absolute_values(integrand, p, piece_low, piece_high)
                step, piece_value = integrate_piece(piece, p, piece_low, piece_high)
                piece_steps.append(step)
                pieces.append(piece_value)
            value = sympy.simplify(sum(pieces))
            math.append(latex_value(value))
            substeps.extend(piece_steps)
        except InputError:
            value = None
    as_numeric = numeric_function(sympy.sqrt(speed_squared), (p,))
    # Integrated piece by piece too: across a kink, where |g| turns at 0,
    # numerical integration loses accuracy.
    numeric = numerical_integral(as_numeric, ends)
    if value is None:
        if numeric is None:
            raise InputError("The arc length couldn't be computed, even numerically.")
        shown = mpmath.nstr(numeric, 10)
        math.append(rf"\\approx {shown}")
        note = (
            "No antiderivative was found with the textbook rules (most arc length integrals "
            "have none), so the length was computed numerically."
        )
        substeps.append(make_step("Numerical integration", note, []))
        check = numerical_cross_check(as_numeric, ends, numeric, shown)
        result = rf"L \\approx {shown}"
    else:
        check = compare("integration", numeric, value)
        result = rf"L = {latex_value(value)}"
    step = make_step("Arc length", explanation, math, substeps)
    return step, {"label": "Arc length", "latex": result}, check, value


# ------------------------------------------------------------------ the area


def area(curve):
    """The area: its step, its result for display, its check, and its exact value."""
    p, (low, high) = curve["parameter"], curve["interval"]
    name = to_latex(p)
    if curve["kind"] == "polar":
        integrand = sympy.simplify(curve["r"] ** 2 / 2)
        rule = "Area of a polar region"
        explanation = (
            r"The region swept by the radius from $\\theta = a$ to $\\theta = b$ is made of thin "
            r"sectors, each of area $\\frac{1}{2} r^2 \\, d\\theta$ (a circle's sector of angle "
            r"$d\\theta$), so $A = \\frac{1}{2}\\int_a^b r^2 \\, d\\theta$."
        )
        formula = rf"A = \\frac{{1}}{{2}}\\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} r^2 \\, d\\theta"
        label = "Area swept by the radius"
    else:
        integrand = sympy.simplify(curve["y"] * curve["dxdt"])
        rule = "Area under a parametric curve"
        explanation = (
            rf"The area between a curve and the $x$-axis is $\\int y\\, dx$. With $dx = \\frac{{dx}}{{d{name}}}\\, d{name}$ "
            rf"it becomes an integral in \${name}$. It is a signed area: it counts as negative "
            r"where the curve runs right to left or below the axis."
        )
        formula = rf"A = \\int y \\, dx = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} y \\, \\frac{{dx}}{{d{name}}} \\, d{name}"
        label = "Area under the curve"
    # Area integrands are polynomials and powers of trig functions, which the
    # general algorithms handle quickly.
    step, value = integrate_piece(integrand, p, low, high, general=True)
    value = sympy.simplify(value)
    as_numeric = numeric_function(integrand, (p,))
    check = compare("integration", numerical_integral(as_numeric, [low, high]), value)
    step = make_step(
        rule,
        explanation,
        [formula, to_latex(sympy.Integral(integrand, (p, low, high))), latex_value(value)],
        [step],
    )
    return step, {"label": label, "latex": rf"A = {latex_value(value)}"}, check, value


# ------------------------------------------------------------------ checking


def numerical_integral(as_numeric, points, method="tanh-sinh"):
    """The integral of as_numeric over [points[0], points[-1]], one piece between
    each pair of neighboring points, by mpmath's tanh-sinh or Gauss-Legendre
    quadrature."""
    with mpmath.workdps(CHECK_DIGITS):
        try:
            value = mpmath.quad(
                lambda point: real_number(as_numeric(point)),
                [mpmath.mpf(str(sympy.N(point, CHECK_DIGITS))) for point in points],
                method=method,
            )
        except Exception:  # Numerical integration fails in many ways; all mean "no value".
            return None
    return None if isinstance(value, mpmath.mpc) else value


def numerical_cross_check(as_numeric, points, numeric, shown):
    """A length with no exact form is checked by computing it again with a
    different method: tanh-sinh and Gauss-Legendre quadrature place their points
    and weigh them differently, so a mistake in one is very unlikely to repeat
    in the other."""
    other = numerical_integral(as_numeric, points, method="gauss-legendre")
    if other is not None and abs(other - numeric) <= CHECK_TOLERANCE * max(1, abs(numeric)):
        return {
            "status": "verified",
            "detail": f"There is no exact form, so the length was computed numerically: two "
            f"different methods (tanh-sinh and Gauss–Legendre quadrature) agree on \${shown}$.",
        }
    return {
        "status": "unchecked",
        "detail": "There is no exact form, and two different numerical methods didn't agree "
        "closely enough to confirm the decimal.",
    }


def compare(kind, numeric, exact):
    if numeric is None:
        return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
    with mpmath.workdps(CHECK_DIGITS):
        expected = mpmath.mpmathify(sympy.N(exact, CHECK_DIGITS))
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if isinstance(expected, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        if abs(numeric - expected) <= CHECK_TOLERANCE * max(1, abs(expected)):
            return {
                "status": "verified",
                "detail": f"A numerical {kind} gives \${shown}$, matching the exact answer.",
            }
    return {
        "status": "failed",
        "detail": f"A numerical {kind} gives \${shown}$, which doesn't match. Treat this answer with caution.",
    }


# ------------------------------------------------------------------ the graph


def graph_samples(curve):
    p, (low, high) = curve["parameter"], curve["interval"]
    x_at, y_at = (numeric_function(coordinate, (p,)) for coordinate in (curve["x"], curve["y"]))
    a, b = float(sympy.N(low)), float(sympy.N(high))
    parameters = [a + (b - a) * index / (GRAPH_POINTS - 1) for index in range(GRAPH_POINTS)]

    def value(function, point):
        try:
            number = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
        except Exception:  # Undefined points raise many error types; all mean "no point here".
            return None
        if isinstance(number, mpmath.mpc) or not mpmath.isfinite(number):
            return None
        return round(float(number), 6)

    xs = [value(x_at, point) for point in parameters]
    ys = [value(y_at, point) for point in parameters]
    graph = {"x": xs, "y": ys, "point": None, "tangent": None, "kind": curve["kind"]}
    if curve.get("point"):
        x0, y0, dx0, dy0 = (float(sympy.N(part)) for part in curve["point"])
        graph["point"] = [x0, y0]
        speed = (dx0**2 + dy0**2) ** 0.5
        if speed > 0:
            # A tangent segment as long as a fifth of the curve's width or height.
            spread = max(
                (max(v for v in values if v is not None) - min(v for v in values if v is not None))
                for values in (xs, ys)
            )
            reach = 0.2 * spread / speed
            graph["tangent"] = {
                "x": [x0 - reach * dx0, x0 + reach * dx0],
                "y": [y0 - reach * dy0, y0 + reach * dy0],
            }
    return graph


# ------------------------------------------------- the lesson picture: a trace

TRACE_STEPS = 120


def trace(request):
    """A point moving along the curve: for each of TRACE_STEPS + 1 parameter
    values, the point, its velocity (dx/dt, dy/dt), and the length traced and
    area swept so far, computed numerically piece by piece."""
    curve = curve_from_request(request)
    p, (low, high) = curve["parameter"], curve["interval"]
    functions = {
        name: numeric_function(curve[name], (p,)) for name in ("x", "y", "dxdt", "dydt")
    }
    speed = numeric_function(sympy.sqrt(curve["dxdt"] ** 2 + curve["dydt"] ** 2), (p,))
    if curve["kind"] == "polar":
        sweep = numeric_function(curve["r"] ** 2 / 2, (p,))
    else:
        sweep = numeric_function(curve["y"] * curve["dxdt"], (p,))
    a, b = float(sympy.N(low)), float(sympy.N(high))
    parameters = [a + (b - a) * index / TRACE_STEPS for index in range(TRACE_STEPS + 1)]

    def number(function, point):
        try:
            value = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
        except Exception:  # Undefined points raise many error types; all mean "no value".
            return None
        if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
            return None
        return round(float(value), 6)

    length = area_so_far = 0.0
    samples = []
    for index, point in enumerate(parameters):
        if index > 0:
            piece = [parameters[index - 1], point]
            length += float(numerical_integral(speed, piece) or 0)
            area_so_far += float(numerical_integral(sweep, piece) or 0)
        samples.append(
            {
                "parameter": round(point, 6),
                **{name: number(function, point) for name, function in functions.items()},
                "length": round(length, 6),
                "area": round(area_so_far, 6),
            }
        )
    return {
        "ok": True,
        "operation": "trace",
        "kind": curve["kind"],
        "samples": samples,
        "curve": graph_samples(curve),
    }


# ---------------------------------------------------------------- the request


def build_curve(kind, x, y, r, interval, at=None):
    """Everything the steps need about a curve. For a polar curve, x and y are
    r cos θ and r sin θ; the parameter is θ for a polar curve and t otherwise."""
    parameter = THETA if kind == "polar" else T
    return {
        "kind": kind,
        "parameter": parameter,
        "x": x,
        "y": y,
        "r": r,
        "dxdt": sympy.diff(x, parameter),
        "dydt": sympy.diff(y, parameter),
        "interval": interval,
        "at": at,
        "point": None,
    }


def curve_from_request(request):
    """The curve a request describes: its kind, its function(s) as LaTeX, its
    interval, and an optional parameter value for a tangent."""
    kind = request.get("curveKind")
    if kind not in ("parametric", "polar"):
        raise InputError("Choose a parametric curve or a polar curve.")
    parameter = THETA if kind == "polar" else T
    if kind == "polar":
        r = parse_curve_function(request.get("expression"), "r(θ)", parameter)
        x, y = r * sympy.cos(parameter), r * sympy.sin(parameter)
    else:
        r = None
        x = parse_curve_function(request.get("xExpression"), "x(t)", parameter)
        y = parse_curve_function(request.get("yExpression"), "y(t)", parameter)
    low, high = parse_interval(request.get("lower"), request.get("upper"), parameter)
    at_text = request.get("at")
    at = None
    if isinstance(at_text, str) and at_text.strip():
        at = parse_bound(at_text, f"tangent's {to_text(parameter)}")
        if at.is_infinite:
            raise InputError(f"The tangent's {to_text(parameter)} must be a number.")
    return build_curve(kind, x, y, r, (low, high), at)


def analyze_curve(request):
    curve = curve_from_request(request)
    parameter, (low, high) = curve["parameter"], curve["interval"]
    if curve["kind"] == "polar":
        curve_latex = rf"r = {to_latex(curve['r'])}"
    else:
        curve_latex = rf"x = {to_latex(curve['x'])}, \\quad y = {to_latex(curve['y'])}"
    name = to_latex(parameter)
    report("Finding the slope…")
    steps, results = slope_steps(curve)
    report("Finding the arc length…")
    length_step, length_result, length_check, _ = arc_length(curve)
    report("Finding the area…")
    area_step, area_result, area_check, _ = area(curve)
    return {
        "ok": True,
        "operation": "curve",
        "curveLatex": rf"{curve_latex}, \\quad {to_latex(low)} \\le {name} \\le {to_latex(high)}",
        "results": [*results, length_result, area_result],
        "checks": [
            {"label": "Arc length", "check": length_check},
            {"label": "Area", "check": area_check},
        ],
        "steps": [*steps, length_step, area_step],
        "graph": graph_samples(curve),
    }
`,"./python/mathlab/definite.py":`"""Definite integrals, proper and improper.

A proper integral is F(b) − F(a) by the Fundamental Theorem of Calculus. An
improper one (an infinite bound, or a point where f breaks down) is split so
each piece has one problem end, and that end becomes a limit; the integral
converges only if every limit is finite. Answers are checked independently:
convergent values against a high-precision numerical integration, divergence
against SymPy's own definite integration.
"""

import re

import mpmath
import sympy
from sympy import AccumBounds
from sympy.calculus.util import continuous_domain

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function, plot_value, real_value
from mathlab.expressions import X, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.steps import make_step

CHECK_DIGITS = 30
# The exact answer and the numerical integration must agree this closely.
CHECK_TOLERANCE = mpmath.mpf("1e-10")
GRAPH_POINT_COUNT = 401
# How far the graph reaches toward an infinite bound.
GRAPH_REACH = 10
# The moving bound in a limit.
T = sympy.Symbol("t", real=True)
SIGNED_INFINITY = re.compile(r"^\\s*([+-]?)\\s*(\\\\infty|∞|oo|inf|infinity)\\s*$", re.IGNORECASE)
INFINITY = re.compile(r"\\\\infty|∞|\\b(oo|inf|infinity)\\b", re.IGNORECASE)


def parse_bound(text, name):
    """A bound typed in the math box: an exact real number, ∞, or −∞."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound.")
    infinite = SIGNED_INFINITY.match(text)
    if infinite:
        return -sympy.oo if infinite.group(1) == "-" else sympy.oo
    if INFINITY.search(text):
        raise InputError(f"The {name} bound: use ∞ or −∞ on its own, or a number.")
    try:
        bound = parse_function(latex_to_text(text), ())
    except InputError as error:
        raise InputError(f"The {name} bound: {error}") from error
    if bound.free_symbols or bound.is_real is not True or bound.is_finite is not True:
        raise InputError(
            f"The {name} bound must be a number (like 0, 1/2, π, or π/2), ∞, or −∞."
        )
    return bound


def bound_text(bound):
    """A bound for plain text, like 1, π/2, ∞, or −∞."""
    if bound == sympy.oo:
        return "∞"
    if bound == -sympy.oo:
        return "−∞"
    return str(bound).replace("pi", "π").replace("-", "−")


def problem_points(function, low, high):
    """The finite points of [low, high] where f isn't continuous, in order."""
    report("Looking for points where the function breaks down…")
    interval = sympy.Interval(low, high)
    try:
        gaps = sympy.Complement(interval, continuous_domain(function, X, interval))
    except Exception:  # SymPy can't always tell; the independent check still guards the answer.
        return []
    if gaps == sympy.S.EmptySet:
        return []
    if not isinstance(gaps, sympy.FiniteSet):
        raise InputError(
            f"The function isn't defined, as a real number, on part of the interval from "
            f"{bound_text(low)} to {bound_text(high)}, so this integral has no value."
        )
    return sorted(gaps, key=float)


def regular_point_between(start, end):
    """A point strictly inside (start, end), for splitting a piece in two."""
    if start == -sympy.oo and end == sympy.oo:
        return sympy.Integer(0)
    if start == -sympy.oo:
        return end - 1
    if end == sympy.oo:
        return start + 1
    return (start + end) / 2


def split_into_pieces(low, high, points):
    """Pieces of [low, high], each with at most one problem end."""
    cuts = [low, *[point for point in points if low < point < high], high]

    def is_problem(end):
        return end.is_infinite or end in points

    pieces = []
    for start, end in zip(cuts, cuts[1:]):
        if is_problem(start) and is_problem(end):
            middle = regular_point_between(start, end)
            pieces += [(start, middle), (middle, end)]
        else:
            pieces.append((start, end))
    return pieces


def endpoint_value(antiderivative, point, direction, variable=X):
    """F at a regular end, approaching from inside the piece if F isn't defined right there."""
    value = antiderivative.subs(variable, point)
    if value.has(sympy.nan, sympy.zoo) or value.is_finite is False:
        value = sympy.limit(antiderivative, variable, point, direction)
    return value


def subtracted_latex(value):
    """A value after a minus sign, in parentheses when it is a sum or negative."""
    latex = to_latex(value)
    if isinstance(value, sympy.Add) or value.could_extract_minus_sign():
        return rf"\\left({latex}\\right)"
    return latex


def limit_of(antiderivative, point, direction):
    """The one-sided limit of F at a problem end, or why it doesn't exist.

    Returns (value, reason): reason is None for a finite limit; otherwise it
    says why the piece diverges, and value is ±∞, or None if the limit
    doesn't exist.
    """
    if point.is_infinite:
        value = sympy.limit(antiderivative, X, point)
    else:
        value = sympy.limit(antiderivative, X, point, direction)
    if isinstance(value, sympy.Limit) or value.has(sympy.Limit):
        raise InputError("SymPy couldn't work out a limit this integral needs.")
    if isinstance(value, AccumBounds) or value.has(sympy.nan, sympy.zoo):
        return None, "$F(t)$ keeps oscillating and has no limit"
    if value.is_infinite:
        return value, rf"$F(t) \\to {to_latex(value)}$"
    return value, None


def limit_latex(point, direction):
    target = to_latex(point) if point.is_infinite else f"{to_latex(point)}^{{{direction}}}"
    return rf"\\lim_{{t \\to {target}}}"


def improper_piece(function, antiderivative, start, end, points):
    """One piece with a problem end: the step, and its value (None if it diverges)."""
    upper_is_problem = end.is_infinite or end in points
    moving, fixed = (end, start) if upper_is_problem else (start, end)
    direction = "-" if upper_is_problem else "+"
    side = "upper" if upper_is_problem else "lower"
    lim = limit_latex(moving, direction)
    target = lim.removeprefix(r"\\lim_{").removesuffix("}")
    if moving.is_infinite:
        reason = (
            rf"The {side} bound is \${to_latex(moving)}$, so replace it with $t$ and let "
            rf"\${target}$."
        )
    else:
        reason = (
            rf"$f$ breaks down at $x = {to_latex(moving)}$, the {side} end of this piece, so "
            rf"replace that end with $t$ and let \${target}$."
        )
    fixed_value = endpoint_value(antiderivative, fixed, "+" if upper_is_problem else "-")
    limit_value, divergence = limit_of(antiderivative, moving, direction)

    at_t = to_latex(antiderivative.subs(X, T))
    if upper_is_problem:
        inner = sympy.Integral(function, (X, start, T))
        bracket = rf"\\left[{to_latex(antiderivative)}\\right]_{{{to_latex(start)}}}^{{t}}"
        difference = rf"\\left({at_t} - {subtracted_latex(fixed_value)}\\right)"
    else:
        inner = sympy.Integral(function, (X, T, end))
        bracket = rf"\\left[{to_latex(antiderivative)}\\right]_{{t}}^{{{to_latex(end)}}}"
        at_t_subtracted = subtracted_latex(antiderivative.subs(X, T))
        difference = rf"\\left({to_latex(fixed_value)} - {at_t_subtracted}\\right)"
    math = [
        to_latex(sympy.Integral(function, (X, start, end))),
        f"{lim} {to_latex(inner)}",
        f"{lim} {bracket}",
        f"{lim} {difference}",
    ]
    if limit_value is None:
        piece_value = None
        math.append(r"\\text{does not exist}")
    elif upper_is_problem:
        piece_value = sympy.simplify(limit_value - fixed_value)
    else:
        piece_value = sympy.simplify(fixed_value - limit_value)
    if piece_value is not None:
        math.append(to_latex(piece_value))
    if divergence is None:
        verdict = "The limit is finite, so this piece converges."
    else:
        verdict = rf"As \${target}$, {divergence}, so this piece diverges."
    step = make_step("Improper integral", f"{reason} {verdict}", math)
    # A diverging piece has no value to add.
    return step, (piece_value if divergence is None else None)


def evaluate_between(function, antiderivative, low, high, variable=X):
    """F(high) − F(low), written out: the equation's parts and the value.

    The bounds may contain other variables, as an inner integral's do.
    """
    at_high = endpoint_value(antiderivative, high, "-", variable)
    at_low = endpoint_value(antiderivative, low, "+", variable)
    value = sympy.simplify(at_high - at_low)
    difference = f"{to_latex(at_high)} - {subtracted_latex(at_low)}"
    math = [
        to_latex(sympy.Integral(function, (variable, low, high))),
        rf"\\left[{to_latex(antiderivative)}\\right]_{{{to_latex(low)}}}^{{{to_latex(high)}}}",
        difference,
    ]
    if to_latex(value) != difference:
        math.append(to_latex(value))
    return math, value


def proper_step(function, antiderivative, low, high):
    """F(high) − F(low), for an interval where f is continuous: the step and the value."""
    math, value = evaluate_between(function, antiderivative, low, high)
    step = make_step(
        "Fundamental Theorem of Calculus",
        r"Evaluate the antiderivative at the upper bound and subtract its value at the lower "
        r"bound: $\\int_a^b f(x)\\,dx = F(b) - F(a)$.",
        math,
    )
    return step, value


def mpmath_point(point):
    if point == sympy.oo:
        return mpmath.inf
    if point == -sympy.oo:
        return -mpmath.inf
    return mpmath.mpf(str(sympy.N(point, CHECK_DIGITS)))


def sympy_definite(function, low, high):
    """SymPy's own definite integration, as an independent opinion, or None."""
    try:
        result = sympy.integrate(function, (X, low, high))
    except Exception:  # Its algorithms fail in many ways; all mean "no opinion".
        return None
    return None if result.has(sympy.Integral) else result


def check_convergent(function, cuts, value, low, high):
    with mpmath.workdps(CHECK_DIGITS):
        exact = real_value(lambda: sympy.N(value, CHECK_DIGITS))
        try:
            numeric = mpmath.quad(numeric_function(function), [mpmath_point(cut) for cut in cuts])
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if exact is not None and numeric is not None and not isinstance(numeric, mpmath.mpc):
            shown = mpmath.nstr(numeric, 10).removesuffix(".0")
            if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
                return {
                    "status": "verified",
                    "detail": f"A high-precision numerical integration gives \${shown}$, "
                    "matching the exact answer.",
                }
            if low.is_finite and high.is_finite:
                return {
                    "status": "failed",
                    "detail": f"A numerical integration gives \${shown}$, which doesn't match. "
                    "Treat this answer with caution.",
                }
    # Numerical integration over an infinite interval can struggle (slow, oscillating
    # integrands), so ask SymPy's own definite integration instead.
    other = sympy_definite(function, low, high)
    if other is not None and other.is_finite and sympy.simplify(other - value) == 0:
        return {
            "status": "verified",
            "detail": "SymPy's own definite integration, a different method, gives the same value.",
        }
    return {"status": "unchecked", "detail": "The value couldn't be confirmed by a second method."}


def check_divergent(function, low, high):
    other = sympy_definite(function, low, high)
    if other is not None and (other.is_infinite or other.has(sympy.nan, sympy.zoo, AccumBounds)):
        return {
            "status": "verified",
            "detail": "SymPy's own definite integration, a different method, also finds no "
            "finite value.",
        }
    if other is not None and other.is_finite:
        return {
            "status": "failed",
            "detail": f"SymPy's own definite integration gives \${to_latex(other)}$, which "
            "disagrees. Treat this answer with caution.",
        }
    return {
        "status": "unchecked",
        "detail": "A divergent integral has no value to check numerically; the limits in the "
        "steps show why it diverges.",
    }


def graph_samples(function, low, high):
    """f around the interval, with the part of it that fits on the graph for shading."""
    if low.is_finite and high.is_finite:
        margin = max(0.25 * float(high - low), 0.5)
        start, end = float(low) - margin, float(high) + margin
    elif low.is_finite:
        start, end = float(low) - 0.5, float(low) + GRAPH_REACH
    elif high.is_finite:
        start, end = float(high) - GRAPH_REACH, float(high) + 0.5
    else:
        start, end = -GRAPH_REACH, GRAPH_REACH
    shade_from = float(low) if low.is_finite else start
    shade_to = float(high) if high.is_finite else end
    step = (end - start) / (GRAPH_POINT_COUNT - 1)
    points = [start + step * index for index in range(GRAPH_POINT_COUNT)]
    # Include the shading's ends, so it starts and stops exactly there.
    xs = sorted({round(point, 6) for point in [*points, shade_from, shade_to]})
    as_numeric = numeric_function(function)
    values = [plot_value(lambda point=point: as_numeric(mpmath.mpf(point))) for point in xs]
    return {"x": xs, "input": values, "area": [round(shade_from, 6), round(shade_to, 6)]}


def graph_note(low, high, converges):
    note = (
        f"Shaded: the region between f(x) and the x-axis from {bound_text(low)} to "
        f"{bound_text(high)}"
    )
    if low.is_infinite or high.is_infinite:
        note += ", which goes on past the edge of the graph"
    note += ". The integral adds the area above the axis and subtracts the area below it."
    if not converges:
        note += " Here that total has no finite value, so the integral diverges."
    return note


def definite_integral(function, lower_text, upper_text):
    lower = parse_bound(lower_text, "lower")
    upper = parse_bound(upper_text, "upper")
    constants = constants_in(function, (X,))
    if constants:
        names = ", ".join(str(constant) for constant in constants)
        raise InputError(
            f"A definite integral needs a function of x alone, so its answer is a number. "
            f"Remove {names}, or use Integrate for an antiderivative with constants."
        )
    reversed_bounds = (upper - lower).is_negative is True
    low, high = (upper, lower) if reversed_bounds else (lower, upper)
    integral = to_latex(sympy.Integral(function, (X, lower, upper)))
    if low == high:
        return result(integral, function, low, high, [], sympy.Integer(0), [low, high], False)

    points = problem_points(function, low, high)
    antiderivative, _, antiderivative_steps, _ = find_antiderivative(function)
    steps = []
    if reversed_bounds:
        steps.append(
            make_step(
                "Swap the bounds",
                r"Integrating from the larger bound to the smaller one gives the negative: "
                r"$\\int_a^b f(x)\\,dx = -\\int_b^a f(x)\\,dx$.",
                [integral, f"-{to_latex(sympy.Integral(function, (X, low, high)))}"],
            )
        )
    steps.append(
        make_step(
            "Find an antiderivative",
            r"Any antiderivative works, because the constant $C$ cancels in the subtraction, "
            r"so take $C = 0$.",
            [to_latex(sympy.Integral(function, X)), f"{to_latex(antiderivative)} + C"],
            antiderivative_steps,
        )
    )

    report("Evaluating the antiderivative at the bounds…")
    pieces = split_into_pieces(low, high, points)
    cuts = [low, *[end for _, end in pieces]]
    if len(pieces) == 1 and not (low.is_infinite or high.is_infinite or points):
        step, value = proper_step(function, antiderivative, low, high)
        steps.append(step)
        return result(integral, function, low, high, steps, value, cuts, reversed_bounds)

    if len(pieces) > 1:
        where = ", ".join(f"$x = {to_latex(point)}$" for point in cuts[1:-1])
        steps.append(
            make_step(
                "Split the integral",
                f"The integral is improper at more than one place, so split it at {where}. "
                "It converges only if every piece converges.",
                [
                    to_latex(sympy.Integral(function, (X, low, high))),
                    " + ".join(to_latex(sympy.Integral(function, (X, a, b))) for a, b in pieces),
                ],
            )
        )
    values = []
    for start, end in pieces:
        if (end.is_infinite or end in points) or (start.is_infinite or start in points):
            step, value = improper_piece(function, antiderivative, start, end, points)
        else:
            step, value = proper_step(function, antiderivative, start, end)
        steps.append(step)
        values.append(value)
    total = None if any(value is None for value in values) else sympy.simplify(sum(values))
    return result(integral, function, low, high, steps, total, cuts, reversed_bounds)


def result(integral, function, low, high, steps, value, cuts, reversed_bounds):
    """The response: value is None when the integral diverges."""
    converges = value is not None
    if converges:
        shown = -value if reversed_bounds else value
        equation = f"{integral} = {to_latex(shown)}"
        if not shown.is_Rational:
            equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(shown, 15))), 6)}"
        check = check_convergent(function, cuts, value, low, high)
    else:
        equation = rf"{integral} \\text{{ diverges}}"
        check = check_divergent(function, low, high)
    return {
        "ok": True,
        "operation": "definite",
        "equationLatex": equation,
        "converges": converges,
        "check": check,
        "steps": steps,
        "stepsNote": None,
        "graph": graph_samples(function, low, high),
        "graphNote": graph_note(low, high, converges),
    }
`,"./python/mathlab/derivative_steps.py":`"""Step-by-step derivatives, using the rules taught in Calculus I.

explain_derivative() returns a derivative together with the step that
explains it. Each rule computes its result from its own formula (for example
u'v + uv' for a product), so the steps and the answer always match. The
calculus module double-checks the result against SymPy's diff().

The same rules give partial derivatives: differentiating x^2 y with respect
to x treats y as a constant, exactly as a student does by hand.
"""

from dataclasses import dataclass

import sympy

from mathlab.checks import agree_numerically, test_values
from mathlab.expressions import X, factor_latex, power_base_latex, to_latex
from mathlab.steps import make_step

# The inner variable of the chain rule. It is real so that the derivative of
# |u| is sign(u) rather than a formula for complex numbers.
U = sympy.Dummy("u", real=True)

FUNCTION_NAMES = {
    sympy.sin: "sine",
    sympy.cos: "cosine",
    sympy.tan: "tangent",
    sympy.sec: "secant",
    sympy.csc: "cosecant",
    sympy.cot: "cotangent",
    sympy.exp: "eˣ",
    sympy.log: "ln",
    sympy.asin: "arcsine",
    sympy.acos: "arccosine",
    sympy.atan: "arctangent",
    sympy.sinh: "sinh",
    sympy.cosh: "cosh",
    sympy.tanh: "tanh",
    sympy.Abs: "absolute value",
}

CHAIN_RULE_ADVICE = (
    "Differentiate the outside, keep the inside as it is, then multiply by the derivative of the inside."
)


@dataclass(frozen=True)
class Differentiation:
    """What to differentiate with respect to, and whether it is a partial derivative."""

    variable: sympy.Symbol = X
    partial: bool = False

    @property
    def name(self):
        return to_latex(self.variable)

    def of(self, expression):
        """LaTeX for the derivative operator applied to expression, like d/dx[...]."""
        if self.partial:
            operator = rf"\\frac{{\\partial}}{{\\partial {self.name}}}"
        else:
            operator = rf"\\frac{{d}}{{d{self.name}}}"
        return rf"{operator}\\left[{to_latex(expression)}\\right]"


ORDINARY = Differentiation()


def combine_fractions(expression):
    """Combine fractions when that makes the answer shorter.

    This turns quotient-rule answers like 1/(x+1) - x/(x+1)^2 into 1/(x+1)^2.
    Full simplification is avoided because it rewrites textbook forms, such as
    turning 2 sin(x) cos(x) into sin(2x).
    """
    combined = sympy.together(expression)
    # together() also factors sums with no fractions, like x^2 + 2x(x+1), so
    # only use it when there is a denominator to combine.
    has_denominator = sympy.denom(combined) != 1
    if has_denominator and sympy.count_ops(combined) < sympy.count_ops(expression):
        return combined
    return expression


def derivative_with_steps(function, d=ORDINARY, variables=(X,)):
    """Return (derivative, steps, steps_note) for the derivative described by d.

    If the step-by-step rules fail or disagree with SymPy's diff(), SymPy's
    answer is used without steps, and steps_note says so.
    """
    sympy_derivative = sympy.diff(function, d.variable)
    values = test_values(sorted(function.free_symbols - set(variables), key=str))
    try:
        derivative, step = explain_derivative(function, d)
        explained = agree_numerically(derivative.subs(values), sympy_derivative.subs(values), variables)
    except Exception:  # Steps are extra: a failure in them must not block the answer.
        explained = False
    if explained:
        steps, steps_note = [step], None
    else:
        derivative = sympy_derivative
        steps, steps_note = [], "Steps aren't available for this derivative."
    combined = combine_fractions(derivative)
    if combined != derivative and steps:
        steps.append(
            make_step(
                "Simplify",
                "Combine the fractions into a single fraction.",
                [to_latex(derivative), to_latex(combined)],
            )
        )
    return combined, steps, steps_note


def explain_derivative(function, d=ORDINARY):
    """Return (derivative, step) for the derivative of function described by d."""
    if not function.has(d.variable):
        return constant_rule(function, d)
    if function == d.variable:
        return sympy.Integer(1), make_step(
            f"Derivative of {d.name}",
            rf"The rate of change of \${d.name}$ with respect to itself is $1$.",
            [d.of(function), "1"],
        )
    if isinstance(function, sympy.Add):
        return sum_rule(function, d)
    if isinstance(function, sympy.Mul):
        return product_or_quotient_rule(function, d)
    if isinstance(function, sympy.Pow):
        return power_rule(function, d)
    if isinstance(function, sympy.Function) and len(function.args) == 1:
        return function_rule(function, d)
    derivative = sympy.diff(function, d.variable)
    return derivative, make_step(
        "Derivative",
        "SymPy computed this derivative directly; none of the basic rules applies.",
        [d.of(function), to_latex(derivative)],
    )


def explain_part(expression, d):
    """Like explain_derivative, but leaves out steps for linear expressions such as
    x + 1 or 3x, whose derivatives are obvious."""
    derivative, step = explain_derivative(expression, d)
    is_linear = expression.is_polynomial(d.variable) and sympy.degree(expression, d.variable) <= 1
    return derivative, None if is_linear else step


def constant_rule(function, d):
    if d.partial and function.free_symbols:
        explanation = (
            rf"\${to_latex(function)}$ doesn't contain \${d.name}$, so it is treated as a "
            "constant, and its derivative is $0$."
        )
    else:
        explanation = "A constant never changes, so its derivative is $0$."
    return sympy.Integer(0), make_step("Constant rule", explanation, [d.of(function), "0"])


def sum_rule(function, d):
    terms = function.as_ordered_terms()
    parts = [explain_part(term, d) for term in terms]
    derivative = sympy.Add(*(term_derivative for term_derivative, _ in parts))
    return derivative, make_step(
        "Sum rule",
        "Differentiate each term separately, then add the results.",
        [d.of(function), " + ".join(d.of(term) for term in terms), to_latex(derivative)],
        [step for _, step in parts],
    )


def product_or_quotient_rule(function, d):
    constant, rest = function.as_independent(d.variable, as_Add=False)
    if constant != 1:
        return constant_multiple_rule(constant, rest, function, d)
    factors = function.as_ordered_factors()
    denominators = [
        factor for factor in factors if isinstance(factor, sympy.Pow) and factor.exp.is_negative
    ]
    numerators = [factor for factor in factors if factor not in denominators]
    if denominators and numerators:
        numerator = sympy.Mul(*numerators)
        denominator = sympy.Mul(*(1 / factor for factor in denominators))
        return quotient_rule(numerator, denominator, function, d)
    first, *others = factors
    return product_rule(first, sympy.Mul(*others), function, d)


def constant_multiple_rule(constant, rest, function, d):
    rest_derivative, rest_step = explain_part(rest, d)
    derivative = constant * rest_derivative
    if d.partial and constant.free_symbols:
        explanation = (
            rf"\${to_latex(constant)}$ doesn't contain \${d.name}$, so treat it as a constant "
            "factor and differentiate the rest."
        )
    else:
        explanation = f"Keep the constant \${to_latex(constant)}$ and differentiate the rest."
    return derivative, make_step(
        "Constant multiple rule",
        explanation,
        [d.of(function), rf"{factor_latex(constant)} \\cdot {d.of(rest)}", to_latex(derivative)],
        [rest_step],
    )


def product_rule(first, second, function, d):
    first_derivative, first_step = explain_part(first, d)
    second_derivative, second_step = explain_part(second, d)
    derivative = first_derivative * second + first * second_derivative
    return derivative, make_step(
        "Product rule",
        rf"For a product $uv$, $(uv)' = u'v + uv'$. Here $u = {to_latex(first)}$ "
        rf"and $v = {to_latex(second)}$.",
        [
            d.of(function),
            rf"{d.of(first)} \\cdot {factor_latex(second)} + {factor_latex(first)} \\cdot {d.of(second)}",
            to_latex(derivative),
        ],
        [first_step, second_step],
    )


def quotient_rule(numerator, denominator, function, d):
    numerator_derivative, numerator_step = explain_part(numerator, d)
    denominator_derivative, denominator_step = explain_part(denominator, d)
    derivative = (
        numerator_derivative * denominator - numerator * denominator_derivative
    ) / denominator**2
    formula = (
        rf"\\frac{{{d.of(numerator)} \\cdot {factor_latex(denominator)} - "
        rf"{factor_latex(numerator)} \\cdot {d.of(denominator)}}}"
        rf"{{{power_base_latex(denominator)}^{{2}}}}"
    )
    return derivative, make_step(
        "Quotient rule",
        r"For a quotient $\\frac{u}{v}$, $\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^{2}}$. "
        rf"Here $u = {to_latex(numerator)}$ and $v = {to_latex(denominator)}$.",
        [d.of(function), formula, to_latex(derivative)],
        [numerator_step, denominator_step],
    )


def power_rule(function, d):
    base, exponent = function.as_base_exp()
    if not exponent.has(d.variable):
        return constant_exponent_rule(base, exponent, function, d)
    if not base.has(d.variable):
        return exponential_rule(base, exponent, function, d)
    return logarithmic_differentiation(base, exponent, function, d)


def constant_exponent_rule(base, exponent, function, d):
    rewrite_note = ""
    if not (exponent.is_integer and exponent.is_positive):
        power_form = rf"{power_base_latex(base)}^{{{to_latex(exponent)}}}"
        rewrite_note = f" Write it as a power first: \${to_latex(function)} = {power_form}$."
    if base == d.variable:
        derivative = exponent * base ** (exponent - 1)
        return derivative, make_step(
            "Power rule",
            r"Bring the exponent down and lower it by one: "
            rf"\${d.of(base ** sympy.Symbol('n'))} = n {d.name}^{{n-1}}$.{rewrite_note}",
            [d.of(function), to_latex(derivative)],
        )
    base_derivative, base_step = explain_part(base, d)
    outer_derivative = exponent * base ** (exponent - 1)
    derivative = outer_derivative * base_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is the power $u^{{{to_latex(exponent)}}}$ (use the power rule) "
        rf"and the inner function is $u = {to_latex(base)}$. {CHAIN_RULE_ADVICE}{rewrite_note}",
        [d.of(function), rf"{factor_latex(outer_derivative)} \\cdot {d.of(base)}", to_latex(derivative)],
        [base_step],
    )


def exponential_rule(base, exponent, function, d):
    outer_derivative = function * sympy.log(base)
    if exponent == d.variable:
        return outer_derivative, make_step(
            "Exponential rule",
            rf"\${d.of(sympy.Symbol('a') ** d.variable)} = a^{{{d.name}}} \\ln a$ for a constant base $a$.",
            [d.of(function), to_latex(outer_derivative)],
        )
    exponent_derivative, exponent_step = explain_part(exponent, d)
    derivative = outer_derivative * exponent_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is $a^{{u}}$ with $a = {to_latex(base)}$, whose derivative is "
        rf"$a^{{u}} \\ln a$, and the inner function is $u = {to_latex(exponent)}$. {CHAIN_RULE_ADVICE}",
        [
            d.of(function),
            rf"{factor_latex(outer_derivative)} \\cdot {d.of(exponent)}",
            to_latex(derivative),
        ],
        [exponent_step],
    )


def logarithmic_differentiation(base, exponent, function, d):
    logarithm = exponent * sympy.log(base)
    logarithm_derivative, logarithm_step = explain_derivative(logarithm, d)
    derivative = function * logarithm_derivative
    return derivative, make_step(
        "Logarithmic differentiation",
        rf"Both the base and the exponent contain \${d.name}$, so neither the power rule nor the "
        rf"exponential rule applies. Rewrite \${to_latex(function)} = e^{{{to_latex(logarithm)}}}$ "
        "and use the chain rule.",
        [d.of(function), rf"{factor_latex(function)} \\cdot {d.of(logarithm)}", to_latex(derivative)],
        [logarithm_step],
    )


def function_rule(function, d):
    outer = function.func
    inner = function.args[0]
    outer_derivative_formula = sympy.diff(outer(U), U)
    if inner == d.variable:
        derivative = outer_derivative_formula.subs(U, inner)
        name = FUNCTION_NAMES.get(outer)
        return derivative, make_step(
            f"Derivative of {name}" if name else "Basic derivative",
            "One of the basic derivatives to know by heart.",
            [d.of(function), to_latex(derivative)],
        )
    inner_derivative, inner_step = explain_part(inner, d)
    outer_derivative = outer_derivative_formula.subs(U, inner)
    derivative = outer_derivative * inner_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is \${to_latex(outer(U))}$, whose derivative is "
        rf"\${to_latex(outer_derivative_formula)}$, and the inner function is "
        rf"$u = {to_latex(inner)}$. {CHAIN_RULE_ADVICE}",
        [d.of(function), rf"{factor_latex(outer_derivative)} \\cdot {d.of(inner)}", to_latex(derivative)],
        [inner_step],
    )
`,"./python/mathlab/directional.py":`"""Directional derivatives and the gradient, for f(x, y) or f(x, y, z).

The directional derivative D_u f is the rate of change of f in the direction
of a unit vector u: D_u f = ∇f · u. Since ∇f · u = |∇f| cos θ, it is largest,
|∇f|, when u points along ∇f, and 0 when u is perpendicular to ∇f.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function, plot_value
from mathlab.definite import parse_bound
from mathlab.derivative_steps import Differentiation, derivative_with_steps
from mathlab.expressions import X, Y, Z, InputError, to_latex
from mathlab.multivariable import sample_square, sample_surface
from mathlab.parsing import constants_in
from mathlab.progress import report
from mathlab.steps import make_step, separate
from mathlab.vectors import vector_latex

CHECK_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")
# The lesson picture's directions, every this many degrees.
ANGLE_STEP = 15
SLICE_REACH = 1.5
SLICE_POINTS = 41
# The lesson picture shows a fixed square this far on each side of the point,
# like the partial derivatives picture: an automatic window grows to fit
# e^y and hides the slope near the point.
PICTURE_HALF_WIDTH = 1.5


def latex_value(value):
    text = to_latex(value)
    if not value.is_Rational and value.is_real:
        text += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(value, 15))), 6)}"
    return text


def number(text, name):
    """A coordinate typed in a math box: an exact, finite number. A decimal
    like 1.1 becomes the fraction 11/10, so answers stay exact."""
    value = parse_bound(text, name)
    if value.is_infinite:
        raise InputError(f"The {name} must be a number.")
    return sympy.nsimplify(value, rational=True) if value.has(sympy.Float) else value


def parse_problem(function, point_texts, direction):
    """The variables, the point, and the direction vector, all exact."""
    texts = [text if isinstance(text, str) else "" for text in (point_texts or [])]
    texts += [""] * (3 - len(texts))
    three = function.has(Z) or texts[2].strip() != ""
    variables = (X, Y, Z) if three else (X, Y)
    names = ("x", "y", "z")[: len(variables)]
    constants = constants_in(function, variables)
    if constants:
        raise InputError(
            f"f must use only {', '.join(names)}, so the answers are numbers. "
            f"Remove {', '.join(str(constant) for constant in constants)}."
        )
    point = tuple(number(texts[index], f"point's {name}") for index, name in enumerate(names))
    if not isinstance(direction, dict):
        raise InputError("Give the direction as a vector or, for f(x, y), an angle.")
    if direction.get("kind") == "angle":
        if three:
            raise InputError("An angle gives a direction in the plane; for f(x, y, z), give a vector.")
        angle = number(direction.get("angle", ""), "angle")
        vector = sympy.Matrix([sympy.cos(angle), sympy.sin(angle)])
        given = ("angle", angle)
    else:
        components = list(direction.get("vector") or [])
        components += [""] * (len(variables) - len(components))
        vector = sympy.Matrix(
            [number(text, f"direction's {name} component") for text, name in zip(components, names)]
        )
        if all(component == 0 for component in vector):
            raise InputError("The direction can't be the zero vector: it has no direction.")
        given = ("vector", vector)
    return variables, point, vector, given


def gradient_steps(function, variables, name="f"):
    """∇f (or ∇g, for another name): each partial derivative with its steps."""
    partials, substeps = [], []
    for variable in variables:
        d = Differentiation(variable, partial=True)
        derivative, steps, _ = derivative_with_steps(function, d, variables)
        partials.append(derivative)
        substeps.append(
            make_step(
                f"Partial derivative in {d.name}",
                rf"Differentiate with respect to \${d.name}$, treating the other variables as constants.",
                [d.of(function), to_latex(derivative)],
                steps,
            )
        )
    gradient = sympy.Matrix(partials)
    step = make_step(
        "Gradient",
        r"The gradient collects the partial derivatives into one vector: "
        rf"$\\nabla {name} = \\langle {name}_x, {name}_y \\rangle$, or "
        rf"$\\langle {name}_x, {name}_y, {name}_z \\rangle$.",
        [rf"\\nabla {name} = {vector_latex(gradient)}"],
        substeps,
    )
    return step, gradient


def numerical_rate(function, variables, point, unit):
    """The rate of change of f along the unit vector, by numerical differentiation."""
    as_numeric = numeric_function(function, variables)
    with mpmath.workdps(CHECK_DIGITS):
        start = [mpmath.mpf(str(sympy.N(value, CHECK_DIGITS))) for value in point]
        direction = [mpmath.mpf(str(sympy.N(value, CHECK_DIGITS))) for value in unit]
        try:
            return mpmath.diff(
                lambda s: as_numeric(*(p + s * d for p, d in zip(start, direction))), 0
            )
        except Exception:  # Numerical differentiation fails in many ways; all mean "no value".
            return None


def check_against(numeric, exact, what):
    if numeric is None or isinstance(numeric, mpmath.mpc):
        return {"status": "unchecked", "detail": f"The {what} couldn't be checked numerically."}
    with mpmath.workdps(CHECK_DIGITS):
        expected = mpmath.mpf(str(sympy.N(exact, CHECK_DIGITS)))
        shown = mpmath.nstr(numeric, 10)
        if abs(numeric - expected) <= CHECK_TOLERANCE * max(1, abs(expected)):
            return {
                "status": "verified",
                "detail": f"Numerical differentiation gives \${shown}$ for the {what}, matching "
                "the exact answer.",
            }
    return {
        "status": "failed",
        "detail": f"Numerical differentiation gives \${shown}$ for the {what}, which doesn't "
        "match. Treat this answer with caution.",
    }


def slice_curve(function, point, unit, rate):
    """For f(x, y): the slice of the surface through the point in direction u,
    and the slice's tangent line, whose slope is D_u f."""
    as_numeric = numeric_function(function, (X, Y))
    a, b = (float(sympy.N(value)) for value in point)
    u = [float(sympy.N(value)) for value in unit]
    z0 = float(sympy.N(function.subs({X: point[0], Y: point[1]})))
    steps = [SLICE_REACH * (2 * index / (SLICE_POINTS - 1) - 1) for index in range(SLICE_POINTS)]
    slope = float(sympy.N(rate))
    reach = SLICE_REACH * 0.6
    return {
        "slice": {
            "x": [a + s * u[0] for s in steps],
            "y": [b + s * u[1] for s in steps],
            "z": [
                plot_value(lambda s=s: as_numeric(mpmath.mpf(a + s * u[0]), mpmath.mpf(b + s * u[1])))
                for s in steps
            ],
        },
        "tangent": {
            "x": [a - reach * u[0], a + reach * u[0]],
            "y": [b - reach * u[1], b + reach * u[1]],
            "z": [z0 - reach * slope, z0 + reach * slope],
        },
    }


def solve_directional(function, variables, point, vector, given):
    """The steps, and the values the answer shows: the gradient (in general and
    at the point), the unit vector, D_u f, and the largest rate |∇f|. given is
    ("angle", θ) or ("vector", v)."""
    substitutions = dict(zip(variables, point))
    at = rf"\\left({', '.join(to_latex(value) for value in point)}\\right)"
    if not sympy.simplify(function.subs(substitutions)).is_finite:
        raise InputError(f"f isn't defined at \${at}$. Choose another point.")
    report("Finding the gradient…")
    gradient_step, gradient = gradient_steps(function, variables)
    gradient_here = gradient.subs(substitutions).applyfunc(sympy.simplify)
    if not all(component.is_finite for component in gradient_here):
        raise InputError(
            f"A partial derivative of f isn't defined at \${at}$, so there is no gradient there."
        )
    length = sympy.simplify(sympy.sqrt(vector.dot(vector)))
    unit = (vector / length).applyfunc(sympy.simplify)
    rate = sympy.simplify(gradient_here.dot(unit))
    largest = sympy.simplify(sympy.sqrt(gradient_here.dot(gradient_here)))

    if given[0] == "angle":
        unit_step = make_step(
            "Unit vector",
            r"A direction at angle $\\theta$ from the positive $x$-axis is the unit vector "
            r"$\\mathbf{u} = \\langle \\cos\\theta, \\sin\\theta \\rangle$.",
            [
                rf"\\mathbf{{u}} = \\langle \\cos {to_latex(given[1])}, \\sin {to_latex(given[1])} \\rangle",
                vector_latex(unit),
            ],
        )
    else:
        unit_step = make_step(
            "Unit vector",
            r"A directional derivative needs a unit vector, so divide the direction by its "
            r"length: $\\mathbf{u} = \\frac{\\mathbf{v}}{|\\mathbf{v}|}$.",
            [
                separate(
                    rf"|\\mathbf{{v}}| = {to_latex(length)}",
                    rf"\\mathbf{{u}} = \\frac{{\\mathbf{{v}}}}{{|\\mathbf{{v}}|}} = {vector_latex(unit)}",
                )
            ],
        )
    steps = [
        gradient_step,
        make_step(
            "Gradient at the point",
            rf"Put the point \${at}$ into each component of $\\nabla f$.",
            [rf"\\nabla f{at} = {vector_latex(gradient_here)}"],
        ),
        unit_step,
        make_step(
            "Directional derivative",
            r"$D_{\\mathbf{u}} f = \\nabla f \\cdot \\mathbf{u}$: the rate of change of $f$ per unit of "
            r"distance moved in the direction $\\mathbf{u}$.",
            [
                rf"D_{{\\mathbf{{u}}}} f{at} = {vector_latex(gradient_here)} \\cdot {vector_latex(unit)}",
                latex_value(rate),
            ],
        ),
    ]
    if largest == 0:
        steps.append(
            make_step(
                "Maximum rate of change",
                rf"$\\nabla f{at} = \\mathbf{{0}}$, so $f$ has a critical point here: its rate of "
                r"change is $0$ in every direction.",
                [],
            )
        )
        largest_result = r"0 \\text{ (a critical point: } \\nabla f = \\mathbf{0})"
    else:
        steps.append(
            make_step(
                "Maximum rate of change",
                r"Since $D_{\\mathbf{u}} f = |\\nabla f| \\cos\\theta$, where $\\theta$ is the angle "
                r"between $\\nabla f$ and $\\mathbf{u}$, it is largest, $|\\nabla f|$, when "
                r"$\\mathbf{u}$ points along $\\nabla f$ ($\\theta = 0$).",
                [rf"|\\nabla f{at}| = {latex_value(largest)}"],
            )
        )
        largest_result = rf"{latex_value(largest)}, \\text{{ along }} {vector_latex(gradient_here)}"
    return {
        "at": at,
        "steps": steps,
        "gradient": gradient,
        "gradient_here": gradient_here,
        "unit": unit,
        "rate": rate,
        "largest": largest,
        "largest_result": largest_result,
    }


def directional_derivative(function, point_texts, direction):
    variables, point, vector, given = parse_problem(function, point_texts, direction)
    solved = solve_directional(function, variables, point, vector, given)
    at, steps, unit, rate, largest = (solved[key] for key in ("at", "steps", "unit", "rate", "largest"))
    gradient, gradient_here = solved["gradient"], solved["gradient_here"]
    report("Checking the answer numerically…")
    checks = [
        {
            "label": "Directional derivative",
            "check": check_against(numerical_rate(function, variables, point, unit), rate, "directional derivative"),
        }
    ]
    if largest != 0:
        steepest = (gradient_here / largest).applyfunc(sympy.simplify)
        checks.append(
            {
                "label": "Maximum rate",
                "check": check_against(
                    numerical_rate(function, variables, point, steepest), largest, "maximum rate"
                ),
            }
        )
    point_names = ", ".join(str(variable) for variable in variables)
    return {
        "ok": True,
        "operation": "directional",
        "functionLatex": rf"f({point_names}) = {to_latex(function)}",
        "results": [
            {"label": "Gradient", "latex": rf"\\nabla f = {vector_latex(gradient)}"},
            {"label": "Gradient at the point", "latex": rf"\\nabla f{at} = {vector_latex(gradient_here)}"},
            {"label": "Unit vector", "latex": rf"\\mathbf{{u}} = {vector_latex(unit)}"},
            {"label": "Directional derivative", "latex": rf"D_{{\\mathbf{{u}}}} f{at} = {latex_value(rate)}"},
            {"label": "Maximum rate of change", "latex": solved["largest_result"]},
        ],
        "checks": checks,
        "steps": steps,
        # f(x, y, z) has no surface to draw.
        "graph": (
            {"surface": sample_surface(function, point), **slice_curve(function, point, unit, rate)}
            if len(variables) == 2
            else None
        ),
    }


def direction_picture(function, point_texts):
    """The lesson picture, for f(x, y) at a point: the surface, ∇f there, and for
    every ANGLE_STEP degrees the slice in that direction, its tangent line, and
    D_u f."""
    variables, point, _, _ = parse_problem(function, point_texts, {"kind": "angle", "angle": "0"})
    gradient = [sympy.diff(function, variable) for variable in variables]
    here = [float(sympy.N(component.subs(dict(zip(variables, point))))) for component in gradient]
    directions = []
    for degrees in range(0, 360, ANGLE_STEP):
        angle = sympy.pi * degrees / 180
        unit = sympy.Matrix([sympy.cos(angle), sympy.sin(angle)])
        rate = sympy.Matrix(here).dot(unit)
        graph = slice_curve(function, point, unit, rate)
        directions.append(
            {
                "degrees": degrees,
                "rate": round(float(sympy.N(rate)), 6),
                "slice": graph["slice"],
                "tangent": graph["tangent"],
            }
        )
    return {
        "ok": True,
        "operation": "directions",
        "point": [float(sympy.N(value)) for value in point],
        "value": float(sympy.N(function.subs(dict(zip(variables, point))))),
        "gradient": here,
        "surface": picture_surface(function, point),
        "directions": directions,
    }


def picture_surface(function, point):
    as_numeric = numeric_function(function, (X, Y))
    xs, ys, z = sample_square(as_numeric, point, PICTURE_HALF_WIDTH)
    value = float(sympy.N(function.subs({X: point[0], Y: point[1]})))
    return {"x": xs, "y": ys, "z": z, "point": [float(sympy.N(point[0])), float(sympy.N(point[1])), value]}
`,"./python/mathlab/double.py":`"""Double integrals, as iterated integrals (Fubini's theorem).

The inside integral is taken first, with the outside variable held constant;
its bounds may depend on the outside variable, which describes a region that
isn't a rectangle. The value is checked with a numerical double integration.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function, plot_value, real_value
from mathlab.definite import INFINITY, evaluate_between, parse_bound
from mathlab.expressions import X, Y, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number, simplify_on_region
from mathlab.steps import make_step

# The order of integration: (inside variable, outside variable).
ORDERS = {"dy dx": (Y, X), "dx dy": (X, Y)}
CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
GRID_SIZE = 41
OUTLINE_POINTS = 60


def parse_inside_bound(text, name, inside, outside):
    """An inside bound: a number or an expression in the outside variable."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound of the inside integral.")
    if INFINITY.search(text):
        raise InputError("Infinite bounds in a double integral aren't supported yet.")
    try:
        bound = parse_function(latex_to_text(text), (outside,))
    except InputError as error:
        raise InputError(f"The inside integral's {name} bound: {error}") from error
    names = {str(symbol) for symbol in bound.free_symbols}
    if str(inside) in names:
        raise InputError(
            f"The inside integral's bounds can depend on {outside} but not on {inside}, "
            f"the variable it integrates."
        )
    if names - {str(outside)}:
        raise InputError(
            f"The inside integral's {name} bound can use only numbers and {outside}."
        )
    return bound


def parse_outside_bound(text, name):
    bound = parse_bound(text, f"outside integral's {name}")
    if bound.is_infinite:
        raise InputError("Infinite bounds in a double integral aren't supported yet.")
    return bound


def antiderivative_step(function, variable, antiderivative, steps):
    return make_step(
        "Find an antiderivative",
        rf"Integrate with respect to \${to_latex(variable)}$. Any antiderivative works, because "
        r"the constant cancels in the subtraction.",
        [to_latex(sympy.Integral(function, variable)), f"{to_latex(antiderivative)} + C"],
        steps,
    )


def numerical_check(function, inside, outside, inner_bounds, outer_bounds, value):
    as_numeric = numeric_function(function, (inside, outside))
    lower, upper = (numeric_function(bound, (outside,)) for bound in inner_bounds)
    with mpmath.workdps(CHECK_DIGITS):
        exact = real_value(lambda: sympy.N(value, CHECK_DIGITS))
        try:
            # real_number drops rounding-size imaginary parts at a curved edge,
            # as from √(1 − x²) evaluated just past x = 1.
            numeric = mpmath.quad(
                lambda o: mpmath.quad(
                    lambda i: real_number(as_numeric(i, o)),
                    [real_number(lower(o)), real_number(upper(o))],
                ),
                [mpmath.mpf(str(sympy.N(bound, CHECK_DIGITS))) for bound in outer_bounds],
            )
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if exact is None or numeric is None or isinstance(numeric, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
            return {
                "status": "verified",
                "detail": f"A numerical double integration gives \${shown}$, matching the exact "
                "answer.",
            }
        return {
            "status": "failed",
            "detail": f"A numerical double integration gives \${shown}$, which doesn't match. "
            "Treat this answer with caution.",
        }


def graph_samples(function, inside, outside, inner_bounds, outer_bounds):
    """The surface over a box around the region, which points are in the region,
    and the region's outline, all in (x, y) coordinates."""
    lower, upper = (numeric_function(bound, (outside,)) for bound in inner_bounds)
    a, b = (float(bound) for bound in outer_bounds)
    outside_points = [a + (b - a) * index / (OUTLINE_POINTS - 1) for index in range(OUTLINE_POINTS)]
    edges = [
        [plot_value(lambda o=o: lower(mpmath.mpf(o))) for o in outside_points],
        [plot_value(lambda o=o: upper(mpmath.mpf(o))) for o in outside_points],
    ]
    if any(value is None for edge in edges for value in edge):
        raise InputError(
            "The inside integral's bounds aren't defined along the whole outside range."
        )
    inside_min = min(min(edge) for edge in edges)
    inside_max = max(max(edge) for edge in edges)

    def padded(low, high):
        margin = max(0.1 * (high - low), 0.25)
        return low - margin, high + margin

    outside_range, inside_range = padded(a, b), padded(inside_min, inside_max)
    if outside == X:
        x_range, y_range = outside_range, inside_range
    else:
        x_range, y_range = inside_range, outside_range

    def grid(low, high):
        step = (high - low) / (GRID_SIZE - 1)
        return [round(low + step * index, 6) for index in range(GRID_SIZE)]

    xs, ys = grid(*x_range), grid(*y_range)
    as_numeric = numeric_function(function, (X, Y))

    def in_region(x, y):
        o, i = (x, y) if outside == X else (y, x)
        if not a - 1e-9 <= o <= b + 1e-9:
            return False
        low, high = (
            plot_value(lambda bound=bound: bound(mpmath.mpf(o))) for bound in (lower, upper)
        )
        if low is None or high is None:
            return False
        return min(low, high) - 1e-9 <= i <= max(low, high) + 1e-9

    def height(x, y):
        return plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y)))

    z = [[height(x, y) for x in xs] for y in ys]
    region = [[in_region(x, y) for x in xs] for y in ys]
    # The outline: along the lower edge, up the far side, back along the upper edge.
    path = [
        *zip(outside_points, edges[0]),
        *zip(reversed(outside_points), reversed(edges[1])),
        (outside_points[0], edges[0][0]),
    ]
    if outside == X:
        outline = {"x": [o for o, _ in path], "y": [i for _, i in path]}
    else:
        outline = {"x": [i for _, i in path], "y": [o for o, _ in path]}
    return {"x": xs, "y": ys, "z": z, "region": region, "outline": outline}


def double_integral(function, order, inner_texts, outer_texts):
    if order not in ORDERS:
        raise InputError("Choose the order of integration: dy dx or dx dy.")
    inside, outside = ORDERS[order]
    constants = constants_in(function, (X, Y))
    if constants:
        names = ", ".join(str(constant) for constant in constants)
        raise InputError(
            f"A double integral needs a function of x and y alone, so its answer is a number. "
            f"Remove {names}."
        )
    inner_bounds = tuple(
        parse_inside_bound(text, name, inside, outside)
        for text, name in zip(inner_texts, ("lower", "upper"))
    )
    outer_bounds = tuple(
        parse_outside_bound(text, name) for text, name in zip(outer_texts, ("lower", "upper"))
    )
    if (outer_bounds[1] - outer_bounds[0]).is_negative:
        raise InputError("The outside integral's lower bound must be at most its upper bound.")

    iterated, steps, value = iterated_integral(function, inside, outside, inner_bounds, outer_bounds)
    equation = f"{iterated} = {to_latex(value)}"
    if not value.is_Rational:
        equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(value, 15))), 6)}"
    return {
        "ok": True,
        "operation": "double",
        "equationLatex": equation,
        "check": numerical_check(function, inside, outside, inner_bounds, outer_bounds, value),
        "steps": steps,
        "stepsNote": None,
        "graph": graph_samples(function, inside, outside, inner_bounds, outer_bounds),
    }


def iterated_integral(function, inside, outside, inner_bounds, outer_bounds):
    """The iterated integral's LaTeX, its steps, and its exact value: the inside
    integral first, with the outside variable held constant, then the outside.
    Practice problems use it too."""
    report("Integrating the inside integral…")
    inner_antiderivative, _, inner_steps, _ = find_antiderivative(function, inside)
    inner_math, inner_value = evaluate_between(
        function, inner_antiderivative, *inner_bounds, inside
    )
    # The result is used only inside the region, which can make it simpler.
    simpler = simplify_on_region(inner_value, (outside,), (outer_bounds,))
    if simpler != inner_value:
        inner_math.append(to_latex(simpler))
        inner_value = simpler
    if inner_value.has(sympy.nan, sympy.zoo, sympy.oo, -sympy.oo):
        raise InputError(
            "The inside integral has no finite value everywhere on the region, so this double "
            "integral is improper, which the Solver can't do yet."
        )
    report("Integrating the outside integral…")
    outer_antiderivative, _, outer_steps, _ = find_antiderivative(inner_value, outside)
    outer_math, value = evaluate_between(inner_value, outer_antiderivative, *outer_bounds, outside)

    iterated = to_latex(sympy.Integral(function, (inside, *inner_bounds), (outside, *outer_bounds)))
    inside_name, outside_name = to_latex(inside), to_latex(outside)
    steps = [
        make_step(
            "Iterated integral",
            rf"Write the double integral over the region $R$ as an iterated integral: integrate "
            rf"with respect to \${inside_name}$ first, from \${to_latex(inner_bounds[0])}$ to "
            rf"\${to_latex(inner_bounds[1])}$, then with respect to \${outside_name}$ from "
            rf"\${to_latex(outer_bounds[0])}$ to \${to_latex(outer_bounds[1])}$.",
            [rf"\\iint_{{R}} {to_latex(function)}\\, dA", iterated],
        ),
        make_step(
            "Inside integral",
            rf"Integrate with respect to \${inside_name}$, treating \${outside_name}$ as a constant, "
            r"then subtract the antiderivative's values at the bounds.",
            inner_math,
            [antiderivative_step(function, inside, inner_antiderivative, inner_steps)],
        ),
        make_step(
            "Outside integral",
            rf"Integrate the result with respect to \${outside_name}$ and evaluate between its "
            r"bounds.",
            outer_math,
            [antiderivative_step(inner_value, outside, outer_antiderivative, outer_steps)],
        ),
    ]
    return iterated, steps, value
`,"./python/mathlab/expressions.py":`"""Shared symbols, the input error, and printing math as LaTeX."""

import sympy
from sympy.printing.latex import LatexPrinter

X = sympy.Symbol("x", real=True)
Y = sympy.Symbol("y", real=True)
Z = sympy.Symbol("z", real=True)
# The parameters of parametric and polar curves.
T = sympy.Symbol("t", real=True)
THETA = sympy.Symbol("theta", real=True)
# Cylindrical and spherical coordinates. r and ρ are distances, so SymPy may
# simplify √(r²) to r.
R = sympy.Symbol("r", nonnegative=True)
RHO = sympy.Symbol("rho", nonnegative=True)
PHI = sympy.Symbol("phi", real=True)


class InputError(Exception):
    """The user's input cannot be used; the message says why and what to do."""


# Functions written the textbook way: sin x, sin(x^2), sin^2 x.
TEXTBOOK_FUNCTIONS = {
    "sin": r"\\sin",
    "cos": r"\\cos",
    "tan": r"\\tan",
    "cot": r"\\cot",
    "sec": r"\\sec",
    "csc": r"\\csc",
    "sinh": r"\\sinh",
    "cosh": r"\\cosh",
    "tanh": r"\\tanh",
    "asin": r"\\arcsin",
    "acos": r"\\arccos",
    "atan": r"\\arctan",
    "sech": r"\\operatorname{sech}",
    "csch": r"\\operatorname{csch}",
    "coth": r"\\coth",
    "asec": r"\\operatorname{arcsec}",
    "acsc": r"\\operatorname{arccsc}",
    "acot": r"\\operatorname{arccot}",
    "asinh": r"\\operatorname{arsinh}",
    "acosh": r"\\operatorname{arcosh}",
    "atanh": r"\\operatorname{artanh}",
    "erf": r"\\operatorname{erf}",
    "sign": r"\\operatorname{sgn}",
}

# LaTeX that is taller than a line of text, which needs tall parentheses.
TALL_LATEX = (r"\\frac", r"\\int", r"\\sum", r"\\sqrt")


class TextbookLatexPrinter(LatexPrinter):
    """Prints functions as textbooks write them.

    SymPy writes sin(x) as \\\\sin{\\\\left(x \\\\right)}, which shows a gap and
    oversized parentheses. This prints sin x, sin(x^2), sin^2 x, and ln|x|.
    """

    def _argument(self, argument):
        text = self._print(argument)
        is_simple = isinstance(argument, sympy.Symbol) or (
            argument.is_Integer and not argument.could_extract_minus_sign()
        )
        if is_simple:
            return f" {text}"
        if any(tall in text for tall in TALL_LATEX):
            return rf"\\left({text}\\right)"
        return f"({text})"

    def _call(self, name, argument, exponent):
        if exponent is not None:
            name = f"{name}^{{{exponent}}}"
        return name + self._argument(argument)

    def _print_Function(self, expr, exp=None):
        name = TEXTBOOK_FUNCTIONS.get(type(expr).__name__)
        if name is None or len(expr.args) != 1:
            return super()._print_Function(expr, exp)
        return self._call(name, expr.args[0], exp)

    def _print_log(self, expr, exp=None):
        argument = expr.args[0]
        if isinstance(argument, sympy.Abs):
            name = r"\\ln" if exp is None else rf"\\ln^{{{exp}}}"
            return name + self._print(argument)
        return self._call(r"\\ln", argument, exp)


LATEX_PRINTER = TextbookLatexPrinter({"inv_trig_style": "full"})


def to_latex(expression):
    return LATEX_PRINTER.doprint(sympy.sympify(expression))


def factor_latex(expression):
    """LaTeX for an expression used as a factor, in parentheses when needed."""
    # SymPy sometimes stores constants as Python ints, which lack SymPy's methods.
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, sympy.Add) or expression.could_extract_minus_sign():
        return rf"\\left({text}\\right)"
    return text


def power_base_latex(expression):
    """LaTeX for an expression that will be raised to a power."""
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, (sympy.Symbol, sympy.Number)) and not expression.could_extract_minus_sign():
        return text
    return rf"\\left({text}\\right)"


def differential_latex(expression, variable):
    """LaTeX for a differential like 2x dx, with parentheses around sums: (x + 1) dx."""
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, sympy.Add):
        text = rf"\\left({text}\\right)"
    return rf"{text}\\,d{to_latex(variable)}"


def with_absolute_value_logs(expression):
    """Write ln(u) as ln|u|, the textbook form that also holds where u < 0."""
    return expression.replace(
        lambda part: isinstance(part, sympy.log) and not isinstance(part.args[0], sympy.Abs),
        lambda part: sympy.log(sympy.Abs(part.args[0])),
    )
`,"./python/mathlab/green.py":`"""Green's theorem: ∮_C P dx + Q dy = ∬_D (∂Q/∂x − ∂P/∂y) dA, where C is the\r
boundary of D traced counterclockwise (D on the left) and P and Q have\r
continuous partial derivatives on all of D.\r
\r
D is given the way an iterated integral describes it: between two curves\r
(y from g₁(x) to g₂(x), or x from h₁(y) to h₂(y)), or in polar coordinates\r
(r from r₁(θ) to r₂(θ)). Both sides are computed: the double integral with\r
the Solver's iterated integrals, and the line integral piece by piece around\r
the boundary. Then they are compared, which checks each against the other.\r
"""\r
\r
import mpmath\r
import sympy\r
\r
from mathlab.curves import latex_value, numerical_integral\r
from mathlab.definite import parse_bound\r
from mathlab.double import iterated_integral, numerical_check, parse_inside_bound\r
from mathlab.expressions import R, T, THETA, X, Y, Z, InputError, factor_latex, to_latex\r
from mathlab.latex_input import latex_to_text\r
from mathlab.line_integrals import (\r
    GRAPH_POINTS,\r
    along_curve,\r
    curve_samples,\r
    defined_everywhere,\r
    field_arrows,\r
    gentle,\r
    independent_integrand,\r
    integrate_along,\r
    parenthesized,\r
    simpson,\r
)\r
from mathlab.parsing import parse_function\r
from mathlab.progress import report\r
from mathlab.steps import make_step, separate\r
from mathlab.tangent import only_variables\r
from mathlab.triple import parse_dependent_bound\r
\r
CHECK_DIGITS = 30\r
CHECK_TOLERANCE = mpmath.mpf("1e-9")\r
# Where the region's bounds are compared (lower ≤ upper, r ≥ 0), as fractions\r
# of the outside interval.\r
BOUND_CHECKS = 41\r
# The lesson picture: positions of the sweep, and Simpson's rule with this\r
# many pieces for each small step and for each line across the region.\r
SWEEP_STEPS = 48\r
SIMPSON_PIECES = 8\r
CROSS_PIECES = 32\r
CURL_GRID = 13\r
\r
# What each side of the region is called. The region is "inside from low(o)\r
# to high(o), outside from a to b"; its boundary is the low curve, the edge\r
# at o = b, the high curve, and the edge at o = a.\r
NAMES = {\r
    "dy dx": {"low": "bottom", "end": "right side", "high": "top", "start": "left side"},\r
    "dx dy": {"low": "left side", "end": "top", "high": "right side", "start": "bottom"},\r
    "polar": {"low": "inner curve", "end": "edge", "high": "outer curve", "start": "edge"},\r
}\r
\r
\r
def parse_field(texts):\r
    texts = list(texts or [])\r
    texts += [""] * (2 - len(texts))\r
    field = []\r
    for text, name in zip(texts[:2], ("P", "Q")):\r
        if not isinstance(text, str) or text.strip() == "":\r
            raise InputError(f"Enter {name}.")\r
        try:\r
            component = parse_function(latex_to_text(text), (X, Y, Z))\r
        except InputError as error:\r
            raise InputError(f"{name}: {error}") from error\r
        if component.has(Z):\r
            raise InputError("Green's theorem is for fields in the plane, so P and Q can use only x and y.")\r
        only_variables(component, (X, Y), name)\r
        field.append(component)\r
    return sympy.Matrix(field)\r
\r
\r
def region_from(request):\r
    """The region D: its kind, its inside and outside variables and their\r
    bounds, how (inside, outside) gives (x, y), and the area factor in dA."""\r
    kind = request.get("order") if request.get("regionKind") != "polar" else "polar"\r
    if kind not in NAMES:\r
        raise InputError("Choose how to describe the region: dy dx, dx dy, or polar.")\r
    if kind == "polar":\r
        inside, outside = R, THETA\r
        inner = tuple(\r
            parse_dependent_bound(request.get(key), name, "inside", R, (THETA,))\r
            for key, name in (("innerLower", "lower"), ("innerUpper", "upper"))\r
        )\r
        outer = tuple(\r
            parse_bound(request.get(key), f"{name} θ") for key, name in (("lower", "starting"), ("upper", "ending"))\r
        )\r
    else:\r
        inside, outside = (Y, X) if kind == "dy dx" else (X, Y)\r
        inner = tuple(\r
            parse_inside_bound(request.get(key), name, inside, outside)\r
            for key, name in (("innerLower", "lower"), ("innerUpper", "upper"))\r
        )\r
        outer = tuple(\r
            parse_bound(request.get(key), f"outside integral's {name}")\r
            for key, name in (("lower", "lower"), ("upper", "upper"))\r
        )\r
    if any(bound.is_infinite for bound in outer):\r
        raise InputError("The region must be bounded, so its bounds must be finite.")\r
    width = sympy.simplify(outer[1] - outer[0])\r
    if not width.is_positive:\r
        raise InputError("The outside lower bound must be less than the upper bound, so the region isn't flat.")\r
    if kind == "polar" and (width - 2 * sympy.pi).is_positive:\r
        raise InputError("θ can go once around at most: the ending θ is at most 2π more than the starting one.")\r
    return make_region(kind, inner, outer)\r
\r
\r
def make_region(kind, inner, outer):\r
    """kind is "dy dx", "dx dy", or "polar"; inner and outer are the inside and\r
    outside (lower, upper) bounds. Practice problems use it too."""\r
    inside, outside = {"dy dx": (Y, X), "dx dy": (X, Y), "polar": (R, THETA)}[kind]\r
    region = {\r
        "kind": kind,\r
        "inside": inside,\r
        "outside": outside,\r
        "inner": inner,\r
        "outer": outer,\r
        "factor": R if kind == "polar" else sympy.Integer(1),\r
    }\r
    check_bounds(region)\r
    return region\r
\r
\r
def to_xy(region, inside_value, outside_value):\r
    if region["kind"] == "polar":\r
        return sympy.Matrix([inside_value * sympy.cos(outside_value), inside_value * sympy.sin(outside_value)])\r
    if region["kind"] == "dy dx":\r
        return sympy.Matrix([outside_value, inside_value])\r
    return sympy.Matrix([inside_value, outside_value])\r
\r
\r
def check_bounds(region):\r
    """The lower inside bound must be at most the upper one all along the\r
    region, or the boundary isn't traced counterclockwise; r can't be negative."""\r
    outside = region["outside"]\r
    low, high = (sympy.lambdify(outside, bound, modules="mpmath") for bound in region["inner"])\r
    a, b = (mpmath.mpf(str(sympy.N(bound, 20))) for bound in region["outer"])\r
    for index in range(BOUND_CHECKS):\r
        o = a + (b - a) * index / (BOUND_CHECKS - 1)\r
        try:\r
            ends = [mpmath.mpmathify(bound(o)) for bound in (low, high)]\r
        except (ValueError, ZeroDivisionError, TypeError):\r
            ends = None\r
        if ends is None or any(isinstance(end, mpmath.mpc) and abs(end.imag) > 1e-9 for end in ends):\r
            raise InputError("The inside bounds aren't defined along the whole outside range.")\r
        lower, upper = (mpmath.re(end) for end in ends)\r
        if lower > upper + 1e-9:\r
            raise InputError("The inside lower bound must be at most the upper bound everywhere in the region.")\r
        if region["kind"] == "polar" and lower < -1e-9:\r
            raise InputError("r can't be negative: the lower bound for r must be 0 or more.")\r
\r
\r
def boundary_pieces(region):\r
    """The boundary, counterclockwise: pieces (side, position r(t), interval).\r
\r
    In the (outside, inside) plane, the loop low curve → edge at b → high\r
    curve → edge at a is counterclockwise. For dy dx that is (x, y) itself;\r
    for dx dy and polar coordinates the plane is flipped, so the loop runs\r
    backward. Pieces with no length are left out, and so are the two edges of\r
    a polar region that goes all the way around, which trace the same ray in\r
    opposite directions and cancel.\r
    """\r
    outside = region["outside"]\r
    low, high = region["inner"]\r
    a, b = region["outer"]\r
    pieces = [\r
        ("low", to_xy(region, low.subs(outside, T), T), (a, b)),\r
        ("end", to_xy(region, T, b), (low.subs(outside, b), high.subs(outside, b))),\r
        ("high", to_xy(region, high.subs(outside, T), T), (b, a)),\r
        ("start", to_xy(region, T, a), (high.subs(outside, a), low.subs(outside, a))),\r
    ]\r
    edges_cancel = (\r
        (to_xy(region, T, a) - to_xy(region, T, b)).applyfunc(sympy.simplify) == sympy.zeros(2, 1)\r
        and sympy.simplify(low.subs(outside, a) - low.subs(outside, b)) == 0\r
        and sympy.simplify(high.subs(outside, a) - high.subs(outside, b)) == 0\r
    )\r
    kept = []\r
    for side, position, (start, stop) in pieces:\r
        if side in ("start", "end") and edges_cancel:\r
            continue\r
        if sympy.simplify(stop - start) == 0:\r
            continue\r
        if position.diff(T).applyfunc(sympy.simplify) == sympy.zeros(2, 1):\r
            continue\r
        kept.append((side, position.applyfunc(sympy.simplify), (sympy.simplify(start), sympy.simplify(stop))))\r
    if region["kind"] != "dy dx":\r
        kept = [(side, position, (stop, start)) for side, position, (start, stop) in reversed(kept)]\r
    return kept\r
\r
\r
def side_description(region, side):\r
    """Like "the bottom, $y = 0$" or "the edge $\\\\theta = \\\\pi$"."""\r
    name = NAMES[region["kind"]][side]\r
    low, high = region["inner"]\r
    a, b = region["outer"]\r
    inside, outside = to_latex(region["inside"]), to_latex(region["outside"])\r
    if side in ("low", "high"):\r
        bound = low if side == "low" else high\r
        return rf"the {name}, \${inside} = {to_latex(bound)}$"\r
    value = b if side == "end" else a\r
    return rf"the {name} \${outside} = {to_latex(value)}$"\r
\r
\r
def piece_step(number, region, field, side, position, interval):\r
    """∫ over one piece of the boundary: the step, the exact value (or None),\r
    and the numerical value."""\r
    low, high = interval\r
    velocity = position.diff(T)\r
    on_curve = along_curve(field, (X, Y), position).applyfunc(gentle)\r
    integrand = gentle(sympy.expand(on_curve.dot(velocity)))\r
    direction = "increasing" if (high - low).is_positive else "decreasing"\r
    explanation = (\r
        rf"Along {side_description(region, side)}: $x = {to_latex(position[0])}$, "\r
        rf"$y = {to_latex(position[1])}$, with $t$ {direction} from \${to_latex(low)}$ to "\r
        rf"\${to_latex(high)}$, which keeps $D$ on the left. Then $dx = {to_latex(velocity[0])}\\,dt$ and "\r
        rf"$dy = {to_latex(velocity[1])}\\,dt$."\r
    )\r
    name = rf"\\int_{{C_{number}}} P\\,dx + Q\\,dy"\r
    if integrand == 0:\r
        step = make_step(\r
            f"Along the {NAMES[region['kind']][side]}",\r
            explanation + r" Here $P\\,dx + Q\\,dy = 0$ all along the piece.",\r
            [name, "0"],\r
        )\r
        return step, sympy.Integer(0), mpmath.mpf(0)\r
    report(f"Integrating along piece {number} of the boundary…")\r
    substeps, value, numeric = integrate_along(integrand, interval)\r
    shown = latex_value(value) if value is not None else rf"\\approx {mpmath.nstr(numeric, 10)}"\r
    step = make_step(\r
        f"Along the {NAMES[region['kind']][side]}",\r
        explanation,\r
        [name, to_latex(sympy.Integral(integrand, (T, low, high))), shown],\r
        substeps,\r
    )\r
    return step, value, numeric\r
\r
\r
def line_side(region, field, pieces):\r
    """∮_C P dx + Q dy, piece by piece: the step, the exact value (or None),\r
    and the numerical value."""\r
    steps, values, numerics = [], [], []\r
    for number, (side, position, interval) in enumerate(pieces, start=1):\r
        step, value, numeric = piece_step(number, region, field, side, position, interval)\r
        steps.append(step)\r
        values.append(value)\r
        numerics.append(numeric)\r
    exact = None if any(value is None for value in values) else sympy.simplify(sum(values))\r
    numeric = sum(numerics)\r
    names = " + ".join(rf"\\int_{{C_{number}}}" for number in range(1, len(pieces) + 1))\r
    if exact is not None:\r
        added = " + ".join(parenthesized(value) for value in values)\r
        math = [r"\\oint_C P\\,dx + Q\\,dy", added, latex_value(exact)] if len(values) > 1 else [\r
            r"\\oint_C P\\,dx + Q\\,dy",\r
            latex_value(exact),\r
        ]\r
    else:\r
        math = [r"\\oint_C P\\,dx + Q\\,dy", rf"\\approx {mpmath.nstr(numeric, 10)}"]\r
    count = len(pieces)\r
    step = make_step(\r
        "Line integral around C",\r
        rf"The long way, as a check: $C$ is made of {count} piece{'s' if count > 1 else ''}, "\r
        rf"\${names}$, each traced so that $D$ is on the left. Integrate along each piece and add.",\r
        math,\r
        steps,\r
    )\r
    return step, exact, numeric\r
\r
\r
def curl_step(field):\r
    P, Q = field\r
    Qx, Py = sympy.diff(Q, X), sympy.diff(P, Y)\r
    curl = sympy.simplify(Qx - Py)\r
    step = make_step(\r
        "Green's theorem integrand",\r
        r"$\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}$ measures how much "\r
        r"$\\mathbf{F}$ circulates, or spins, around each point: positive for counterclockwise. "\r
        r"Green's theorem adds it up over $D$.",\r
        [\r
            separate(\r
                rf"\\frac{{\\partial Q}}{{\\partial x}} = {to_latex(Qx)}",\r
                rf"\\frac{{\\partial P}}{{\\partial y}} = {to_latex(Py)}",\r
                rf"\\frac{{\\partial Q}}{{\\partial x}} - \\frac{{\\partial P}}{{\\partial y}} = {to_latex(curl)}",\r
            ),\r
        ],\r
    )\r
    return step, curl\r
\r
\r
def double_side(region, curl):\r
    """∬_D curl dA as an iterated integral: the step, the integrand in the\r
    region's variables (None when curl is 0), and the exact value."""\r
    if curl == 0:\r
        step = make_step(\r
            "Double integral over D",\r
            r"The integrand is $0$, so the double integral is $0$.",\r
            [r"\\iint_D 0\\, dA", "0"],\r
        )\r
        return step, None, sympy.Integer(0)\r
    inside, outside = region["inside"], region["outside"]\r
    substeps = []\r
    integrand = curl\r
    if region["kind"] == "polar":\r
        substituted = sympy.simplify(curl.subs({X: R * sympy.cos(THETA), Y: R * sympy.sin(THETA)}, simultaneous=True))\r
        integrand = sympy.simplify(substituted * R)\r
        substeps.append(\r
            make_step(\r
                "Change to polar coordinates",\r
                r"Write $x = r\\cos\\theta$ and $y = r\\sin\\theta$, and replace $dA$ by $r\\,dr\\,d\\theta$: "\r
                r"a small polar box has sides $dr$ and $r\\,d\\theta$ (an arc of a circle of radius $r$), "\r
                r"as in cylindrical coordinates.",\r
                [\r
                    r"\\left(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\right) dA",\r
                    rf"{factor_latex(substituted)} \\cdot r\\, dr\\, d\\theta",\r
                    rf"{to_latex(integrand)}\\, dr\\, d\\theta",\r
                ],\r
            )\r
        )\r
    iterated, steps, value = iterated_integral(integrand, inside, outside, region["inner"], region["outer"])\r
    substeps.extend(steps[1:])\r
    step = make_step(\r
        "Double integral over D",\r
        rf"Integrate over $D$ as an iterated integral: \${to_latex(inside)}$ inside, from "\r
        rf"\${to_latex(region['inner'][0])}$ to \${to_latex(region['inner'][1])}$, then "\r
        rf"\${to_latex(outside)}$ from \${to_latex(region['outer'][0])}$ to \${to_latex(region['outer'][1])}$.",\r
        [rf"\\iint_D \\left({to_latex(curl)}\\right) dA", iterated, latex_value(value)],\r
        substeps,\r
    )\r
    return step, integrand, value\r
\r
\r
def boundary_numeric(field, pieces, method="tanh-sinh"):\r
    """∮_C P dx + Q dy computed numerically straight from the typed field, or\r
    None if a piece couldn't be integrated."""\r
    total = mpmath.mpf(0)\r
    for _, position, interval in pieces:\r
        value = numerical_integral(independent_integrand("vector", field, (X, Y), position), list(interval), method)\r
        if value is None:\r
            return None\r
        total += value\r
    return total\r
\r
\r
def agrees(first, second):\r
    with mpmath.workdps(CHECK_DIGITS):\r
        expected = mpmath.mpf(str(sympy.N(first, CHECK_DIGITS))) if isinstance(first, sympy.Basic) else first\r
        return abs(second - expected) <= CHECK_TOLERANCE * max(1, abs(expected))\r
\r
\r
def shown_number(value):\r
    return mpmath.nstr(value, 10).removesuffix(".0")\r
\r
\r
def line_check(field, pieces, exact, numeric):\r
    independent = boundary_numeric(field, pieces)\r
    if independent is None:\r
        return {"status": "unchecked", "detail": "The line integral couldn't be checked numerically."}, None\r
    if exact is not None:\r
        if agrees(exact, independent):\r
            return {\r
                "status": "verified",\r
                "detail": f"Integrating numerically around $C$, straight from the typed field, gives "\r
                f"\${shown_number(independent)}$, matching the exact answer.",\r
            }, independent\r
        return {\r
            "status": "failed",\r
            "detail": f"Integrating numerically around $C$ gives \${shown_number(independent)}$, which "\r
            "doesn't match. Treat this answer with caution.",\r
        }, independent\r
    other = boundary_numeric(field, pieces, "gauss-legendre")\r
    if other is not None and agrees(independent, other) and agrees(independent, numeric):\r
        return {\r
            "status": "verified",\r
            "detail": f"There is no exact form along the boundary, so it was computed numerically: two "\r
            f"different methods (tanh-sinh and Gauss–Legendre quadrature) agree on "\r
            f"\${shown_number(independent)}$.",\r
        }, independent\r
    return {\r
        "status": "unchecked",\r
        "detail": "There is no exact form along the boundary, and two numerical methods didn't agree "\r
        "closely enough to confirm the decimal.",\r
    }, independent\r
\r
\r
def comparison(field, double_value, line_exact, line_numeric):\r
    """The last step, and the check that both sides agree (None when Green's\r
    theorem doesn't apply because F isn't defined everywhere)."""\r
    if line_exact is not None:\r
        equal = sympy.simplify(double_value - line_exact) == 0 or (\r
            line_numeric is not None and agrees(double_value, line_numeric)\r
        )\r
    else:\r
        equal = line_numeric is not None and agrees(double_value, line_numeric)\r
    shown = latex_value(double_value)\r
    if equal:\r
        step = make_step(\r
            "Compare the two sides",\r
            r"The line integral around $C$ equals the double integral over $D$, as Green's theorem says. "\r
            r"Often the double integral is the easier way to get it.",\r
            [\r
                r"\\oint_C P\\,dx + Q\\,dy",\r
                r"\\iint_D \\left(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\right) dA",\r
                shown,\r
            ],\r
        )\r
        computed = (\r
            f"The line integral, computed numerically around $C$ from the typed field, is \${shown_number(line_numeric)}$"\r
            if line_numeric is not None\r
            else f"The line integral, computed exactly around $C$, is \${shown}$"\r
        )\r
        check = {"status": "verified", "detail": f"{computed}, equal to the double integral, as Green's theorem says."}\r
        return step, check\r
    if not all(defined_everywhere(component) for component in field):\r
        step = make_step(\r
            "Compare the two sides",\r
            r"The two sides differ, so Green's theorem doesn't apply here: it needs $P$ and $Q$ with "\r
            r"continuous partial derivatives at every point of $D$, but $\\mathbf{F}$ isn't defined at "\r
            r"some point inside $D$ (where a denominator is $0$, for example). The line integral, computed "\r
            r"directly, is the answer.",\r
            [],\r
        )\r
        return step, None\r
    step = make_step(\r
        "Compare the two sides",\r
        r"The two sides should be equal by Green's theorem, but they differ. Treat these answers with caution.",\r
        [],\r
    )\r
    check = {\r
        "status": "failed",\r
        "detail": f"The line integral, computed numerically, is \${shown_number(line_numeric)}$, which doesn't "\r
        "match the double integral. Treat this answer with caution.",\r
    }\r
    return step, check\r
\r
\r
def solve_green(field, region):\r
    """Both sides of Green's theorem: the steps, the double integral's exact\r
    value, and the line integral's exact value (or None) and numerical value.\r
    Practice problems use it too."""\r
    statement = make_step(\r
        "Green's theorem",\r
        r"$C$ is the boundary of $D$, traced counterclockwise (with $D$ on the left), and "\r
        r"$\\mathbf{F} = \\langle P, Q \\rangle$. Green's theorem turns the line integral around $C$ "\r
        r"into a double integral over $D$.",\r
        [\r
            r"\\oint_C P\\,dx + Q\\,dy",\r
            r"\\iint_D \\left(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\right) dA",\r
        ],\r
    )\r
    first, curl = curl_step(field)\r
    report("Integrating over the region…")\r
    double_step, integrand, double_value = double_side(region, curl)\r
    pieces = boundary_pieces(region)\r
    line_step, line_exact, line_numeric = line_side(region, field, pieces)\r
    return {\r
        "steps": [statement, first, double_step, line_step],\r
        "curl": curl,\r
        "integrand": integrand,\r
        "double": double_value,\r
        "line": line_exact,\r
        "lineNumeric": line_numeric,\r
        "pieces": pieces,\r
    }\r
\r
\r
def region_latex(region):\r
    inside, outside = to_latex(region["inside"]), to_latex(region["outside"])\r
    low, high = (to_latex(bound) for bound in region["inner"])\r
    a, b = (to_latex(bound) for bound in region["outer"])\r
    return rf"D: {low} \\le {inside} \\le {high}, \\quad {a} \\le {outside} \\le {b}"\r
\r
\r
def green_graph(field, pieces):\r
    """Each piece of the boundary as points, in order, and the field's arrows."""\r
    curves = []\r
    for _, position, interval in pieces:\r
        _, (xs, ys) = curve_samples(position, interval, GRAPH_POINTS // 2)\r
        curves.append({"x": xs, "y": ys})\r
    xs = [x for curve in curves for x in curve["x"]]\r
    ys = [y for curve in curves for y in curve["y"]]\r
    return {"pieces": curves, "arrows": field_arrows(field, (X, Y), xs, ys)}\r
\r
\r
def green(request):\r
    field = parse_field(request.get("fieldLatex"))\r
    region = region_from(request)\r
    solved = solve_green(field, region)\r
    report("Checking the answer numerically…")\r
    checks = []\r
    if solved["integrand"] is not None:\r
        checks.append(\r
            {\r
                "label": "Double integral",\r
                "check": numerical_check(\r
                    solved["integrand"],\r
                    region["inside"],\r
                    region["outside"],\r
                    region["inner"],\r
                    region["outer"],\r
                    solved["double"],\r
                ),\r
            }\r
        )\r
    check, independent = line_check(field, solved["pieces"], solved["line"], solved["lineNumeric"])\r
    checks.append({"label": "Line integral", "check": check})\r
    compare_step, compare_check = comparison(field, solved["double"], solved["line"], independent)\r
    if compare_check is not None:\r
        checks.append({"label": "Green's theorem", "check": compare_check})\r
    line_shown = (\r
        latex_value(solved["line"])\r
        if solved["line"] is not None\r
        else rf"\\approx {mpmath.nstr(solved['lineNumeric'], 10)}"\r
    )\r
    equals = "" if solved["line"] is None else "="\r
    return {\r
        "ok": True,\r
        "operation": "green",\r
        "problemLatex": rf"\\oint_C P\\,dx + Q\\,dy, \\quad \\mathbf{{F}} = \\left\\langle {to_latex(field[0])}, "\r
        rf"{to_latex(field[1])} \\right\\rangle, \\quad {region_latex(region)}",\r
        "results": [\r
            {\r
                "label": "Double integral",\r
                "latex": rf"\\iint_D \\left(\\frac{{\\partial Q}}{{\\partial x}} - \\frac{{\\partial P}}{{\\partial y}}\\right) dA = "\r
                rf"{latex_value(solved['double'])}",\r
            },\r
            {"label": "Line integral around C", "latex": rf"\\oint_C P\\,dx + Q\\,dy {equals} {line_shown}"},\r
        ],\r
        "checks": checks,\r
        "steps": [*solved["steps"], compare_step],\r
        "graph": green_graph(field, solved["pieces"]),\r
    }\r
\r
\r
# ------------------------------------------------------------------ the lesson picture\r
\r
\r
def float_function(expression, variables):\r
    as_float = sympy.lambdify(variables, expression, modules="math")\r
    return lambda *values: float(as_float(*values))\r
\r
\r
def green_sweep(request):\r
    """The lesson picture: D filled in a little at a time, from o = a up to\r
    o = s, and at each position both sides of Green's theorem for the part\r
    filled so far, which agree all along.\r
\r
    The filled part D_s has the same description as D with b replaced by s, so\r
    its boundary is the low curve from a to s, the edge at s, the high curve\r
    back, and the edge at a. Everything here is numerical (Simpson's rule)."""\r
    field = parse_field(request.get("fieldLatex"))\r
    region = region_from(request)\r
    _, curl = curl_step(field)\r
    inside, outside = region["inside"], region["outside"]\r
    low, high = region["inner"]\r
\r
    def work(position, variables):\r
        """P dx + Q dy along position, a function of t (and maybe o)."""\r
        integrand = along_curve(field, (X, Y), position).dot(position.diff(T))\r
        return float_function(integrand, variables)\r
\r
    low_work = work(to_xy(region, low.subs(outside, T), T), (T,))\r
    high_work = work(to_xy(region, high.subs(outside, T), T), (T,))\r
    edge_work = work(to_xy(region, T, outside), (T, outside))\r
    point = to_xy(region, inside, outside)\r
    across = float_function(curl.subs({X: point[0], Y: point[1]}, simultaneous=True) * region["factor"], (inside, outside))\r
    low_at, high_at = float_function(low, (outside,)), float_function(high, (outside,))\r
    x_at, y_at = (float_function(coordinate, (inside, outside)) for coordinate in point)\r
\r
    def xy(i, o):\r
        return x_at(i, o), y_at(i, o)\r
\r
    a, b = (float(sympy.N(bound)) for bound in region["outer"])\r
\r
    def cross(o):\r
        """The line integral along the edge at o, from low(o) to high(o), and the\r
        inside integral of the integrand times the area factor across it."""\r
        lo, hi = low_at(o), high_at(o)\r
        if hi - lo < 1e-12:\r
            return 0.0, 0.0\r
        edge = simpson(lambda t: edge_work(t, o), lo, hi, CROSS_PIECES)\r
        inner = simpson(lambda i: across(i, o), lo, hi, CROSS_PIECES)\r
        return edge, inner\r
\r
    try:\r
        positions = [a + (b - a) * index / SWEEP_STEPS for index in range(SWEEP_STEPS + 1)]\r
        start_edge, previous_inner = cross(a)\r
        samples = []\r
        low_total = high_total = double_total = 0.0\r
        for index, s in enumerate(positions):\r
            end_edge, inner = cross(s)\r
            if index > 0:\r
                previous = positions[index - 1]\r
                low_total += simpson(low_work, previous, s, SIMPSON_PIECES)\r
                high_total += simpson(high_work, previous, s, SIMPSON_PIECES)\r
                _, middle = cross((previous + s) / 2)\r
                double_total += (s - previous) * (previous_inner + 4 * middle + inner) / 6\r
            previous_inner = inner\r
            # Counterclockwise in (x, y). For dx dy and polar regions the loop\r
            # low → edge at s → high → edge at a runs clockwise, so flip it.\r
            loop = low_total + end_edge - high_total - start_edge\r
            line = loop if region["kind"] == "dy dx" else -loop\r
            samples.append({"s": round(s, 6), "line": round(line, 6), "double": round(double_total, 6)})\r
        lows = [xy(low_at(s), s) for s in positions]\r
        highs = [xy(high_at(s), s) for s in positions]\r
        edges = [[xy(low_at(s) + (high_at(s) - low_at(s)) * k / 20, s) for k in range(21)] for s in positions]\r
        dots = curl_dots(curl, region, xy, low_at, high_at, a, b)\r
    except (ValueError, ZeroDivisionError, OverflowError, TypeError) as error:\r
        raise InputError("The picture couldn't be drawn: the field isn't defined everywhere in the region.") from error\r
    outline = green_graph(field, boundary_pieces(region))\r
    return {\r
        "ok": True,\r
        "operation": "greenSweep",\r
        "kind": region["kind"],\r
        "samples": samples,\r
        "pieces": outline["pieces"],\r
        "arrows": outline["arrows"],\r
        "curl": dots,\r
        "low": rounded_points(lows),\r
        "high": rounded_points(highs),\r
        "edges": [rounded_points(edge) for edge in edges],\r
    }\r
\r
\r
def rounded_points(points):\r
    return {"x": [round(x, 6) for x, _ in points], "y": [round(y, 6) for _, y in points]}\r
\r
\r
def curl_dots(curl, region, xy, low_at, high_at, a, b):\r
    """Q_x − P_y at a grid of points inside D: [x, y, value]."""\r
    curl_at = float_function(curl, (X, Y))\r
    dots = []\r
    for row in range(CURL_GRID):\r
        o = a + (b - a) * (row + 0.5) / CURL_GRID\r
        lo, hi = low_at(o), high_at(o)\r
        for column in range(CURL_GRID):\r
            x, y = xy(lo + (hi - lo) * (column + 0.5) / CURL_GRID, o)\r
            dots.append([round(x, 6), round(y, 6), round(curl_at(x, y), 6)])\r
    return dots\r
`,"./python/mathlab/integral_steps.py":`"""Step-by-step integrals, from the rule tree SymPy's manualintegrate builds.

manualintegrate solves integrals with the techniques taught in calculus
courses (substitution, integration by parts, partial fractions, ...) and
records which rule it used at each step. This module picks the simplest
solution when there are several and turns its rules into explained steps.
"""

import dataclasses
import re

import sympy
from sympy.integrals import manualintegrate

from mathlab.expressions import (
    differential_latex,
    factor_latex,
    power_base_latex,
    to_latex,
    with_absolute_value_logs,
)
from mathlab.steps import make_step

# Solutions with more rules than this are too long to read as steps.
MAX_STEP_COUNT = 60

STANDARD_LABELS = {
    "SinRule": "Integral of sine",
    "CosRule": "Integral of cosine",
    "Sec2Rule": "Integral of sec²",
    "Csc2Rule": "Integral of csc²",
    "SecTanRule": "Integral of sec · tan",
    "CscCotRule": "Integral of csc · cot",
    "SinhRule": "Integral of sinh",
    "CoshRule": "Integral of cosh",
    "ArctanRule": "Arctangent form",
    "ArcsinRule": "Arcsine form",
    "ArcsinhRule": "Inverse sinh form",
}

SPECIAL_FUNCTION_RULES = (
    "ErfRule",
    "FresnelSRule",
    "FresnelCRule",
    "EiRule",
    "SiRule",
    "CiRule",
    "ChiRule",
    "ShiRule",
    "LiRule",
    "UpperGammaRule",
    "PolylogRule",
    "EllipticFRule",
    "EllipticERule",
)


def child_rules(rule):
    for field in dataclasses.fields(rule):
        value = getattr(rule, field.name)
        if isinstance(value, manualintegrate.Rule):
            yield value
        elif isinstance(value, list):
            yield from (item for item in value if isinstance(item, manualintegrate.Rule))


def rule_count(rule):
    return 1 + sum(rule_count(child) for child in child_rules(rule))


def substitution_size(rule):
    """How complicated the substitutions are, to prefer u = x^2 over u = e^(x^2)."""
    own = sympy.count_ops(rule.u_func) if isinstance(rule, manualintegrate.URule) else 0
    return own + sum(substitution_size(child) for child in child_rules(rule))


def choose_alternatives(rule):
    """Replace each AlternativeRule with its simplest alternative, recursively."""
    if isinstance(rule, manualintegrate.AlternativeRule):
        candidates = [choose_alternatives(alternative) for alternative in rule.alternatives]
        return min(
            candidates,
            key=lambda candidate: (
                candidate.contains_dont_know(),
                rule_count(candidate),
                substitution_size(candidate),
            ),
        )
    changes = {}
    for field in dataclasses.fields(rule):
        value = getattr(rule, field.name)
        if isinstance(value, manualintegrate.Rule):
            changes[field.name] = choose_alternatives(value)
        elif isinstance(value, list) and any(isinstance(item, manualintegrate.Rule) for item in value):
            changes[field.name] = [
                choose_alternatives(item) if isinstance(item, manualintegrate.Rule) else item
                for item in value
            ]
    return dataclasses.replace(rule, **changes) if changes else rule


def find_integral_rule(function, variable):
    """Return (rule, antiderivative) solved with textbook rules, or None if there is no such solution."""
    try:
        rule = choose_alternatives(manualintegrate.integral_steps(function, variable))
        if rule.contains_dont_know():
            return None
        return rule, rule.eval()
    except Exception:  # manualintegrate fails in many ways on integrals it cannot do.
        return None


def explain_integral(rule, use_absolute_logs):
    """Return the list of steps explaining rule.

    use_absolute_logs writes ln|u| instead of ln(u), to match the final answer.
    """
    present = with_absolute_value_logs if use_absolute_logs else (lambda expression: expression)
    return [explain_rule(rule, present)]


def integral_of(integrand, variable):
    return to_latex(sympy.Integral(integrand, variable))


def result_latex(rule, present):
    return to_latex(present(rule.eval()))


def explain_rule(rule, present):
    for rule_type in type(rule).__mro__:
        explainer = EXPLAINERS.get(rule_type)
        if explainer is not None:
            return explainer(rule, present)
    return explain_other(rule, present)


def explain_constant(rule, present):
    return make_step(
        "Constant rule",
        rf"The integral of a constant $c$ is $c\\,{to_latex(rule.variable)}$.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_constant_times(rule, present):
    return make_step(
        "Constant multiple rule",
        f"Move the constant \${to_latex(rule.constant)}$ outside the integral.",
        [
            integral_of(rule.integrand, rule.variable),
            rf"{factor_latex(rule.constant)} {integral_of(rule.other, rule.variable)}",
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_power(rule, present):
    note = ""
    if not (rule.exp.is_integer and rule.exp.is_positive):
        power_form = rf"{power_base_latex(rule.base)}^{{{to_latex(rule.exp)}}}"
        note = f" Here \${to_latex(rule.integrand)} = {power_form}$."
    return make_step(
        "Power rule",
        r"Raise the power by one and divide by the new power: "
        rf"$\\int x^{{n}}\\,dx = \\frac{{x^{{n+1}}}}{{n+1}}$ for $n \\neq -1$.{note}",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_reciprocal(rule, _present):
    # ln|u| is the textbook antiderivative of 1/u, whatever the final answer uses.
    return make_step(
        "Reciprocal rule",
        r"$\\int \\frac{1}{u}\\,du = \\ln|u|$, because the derivative of $\\ln|u|$ is $\\frac{1}{u}$.",
        [integral_of(rule.integrand, rule.variable), to_latex(with_absolute_value_logs(rule.eval()))],
    )


def explain_exp(rule, present):
    variable = to_latex(rule.variable)
    if rule.base == sympy.E:
        explanation = rf"$e^{{{variable}}}$ is its own derivative, so it is also its own antiderivative."
    else:
        explanation = r"$\\int a^{x}\\,dx = \\frac{a^{x}}{\\ln a}$ for a constant base $a$."
    return make_step(
        "Exponential rule",
        explanation,
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_add(rule, present):
    terms = [substep.integrand for substep in rule.substeps]
    return make_step(
        "Sum rule",
        "Integrate each term separately, then add the results.",
        [
            integral_of(rule.integrand, rule.variable),
            " + ".join(integral_of(term, rule.variable) for term in terms),
            result_latex(rule, present),
        ],
        [explain_rule(substep, present) for substep in rule.substeps],
    )


def explain_substitution(rule, present):
    variable = rule.variable
    u_latex = to_latex(rule.u_func)
    du = sympy.diff(rule.u_func, variable)
    inner = rule.substep
    return make_step(
        "Substitution",
        rf"Let $u = {u_latex}$, so $du = {differential_latex(du, variable)}$. Rewrite the "
        rf"integral in terms of $u$, integrate, then put $u = {u_latex}$ back.",
        [
            integral_of(rule.integrand, variable),
            integral_of(inner.integrand, rule.u_var),
            to_latex(present(inner.eval())),
            result_latex(rule, present),
        ],
        [explain_rule(inner, present)],
    )


def explain_parts(rule, present, variable=None):
    """Explain one integration by parts.

    Inside cyclic integration by parts, SymPy leaves the rule's variable and
    remaining integral empty, so the parent passes the variable and shows the math.
    """
    variable = rule.variable if rule.variable is not None else variable
    v = rule.v_step.eval()
    du = sympy.diff(rule.u, variable)
    explanation = (
        rf"Use $\\int u\\,dv = uv - \\int v\\,du$ with $u = {to_latex(rule.u)}$ and "
        rf"$dv = {differential_latex(rule.dv, variable)}$. Then "
        rf"$du = {differential_latex(du, variable)}$ and $v = {to_latex(present(v))}$."
    )
    if rule.second_step is None:
        return make_step("Integration by parts", explanation, [])
    return make_step(
        "Integration by parts",
        explanation,
        [
            integral_of(rule.integrand, variable),
            rf"{to_latex(present(rule.u * v))} - {integral_of(rule.second_step.integrand, variable)}",
            result_latex(rule, present),
        ],
        [explain_rule(rule.second_step, present)],
    )


def explain_cyclic_parts(rule, present):
    return make_step(
        "Integration by parts (cyclic)",
        "Integrating by parts twice brings back the original integral. Move it to the "
        "left-hand side and solve for it.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
        [explain_parts(parts_rule, present, rule.variable) for parts_rule in rule.parts_rules],
    )


def explain_rewrite(rule, present):
    variable = rule.variable
    equation = f"{to_latex(rule.integrand)} = {to_latex(rule.rewritten)}"
    is_partial_fractions = (
        rule.integrand.is_rational_function(variable)
        and len(sympy.Add.make_args(sympy.expand(rule.rewritten))) > 1
    )
    if is_partial_fractions:
        label, explanation = "Partial fractions", f"Split the fraction into simpler ones: \${equation}$."
    else:
        label, explanation = "Rewrite", f"Rewrite the integrand: \${equation}$."
    return make_step(
        label,
        explanation,
        [
            integral_of(rule.integrand, variable),
            integral_of(rule.rewritten, variable),
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_trig_substitution(rule, present):
    theta = to_latex(rule.theta)
    return make_step(
        "Trigonometric substitution",
        rf"Let \${to_latex(rule.variable)} = {to_latex(rule.func)}$, which turns the square root "
        rf"into a trigonometric function. Integrate in \${theta}$, then convert back.",
        [
            integral_of(rule.integrand, rule.variable),
            integral_of(rule.rewritten, rule.theta),
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_special_function(rule, present):
    return make_step(
        "Special function",
        "This integral has no antiderivative made of elementary functions (powers, roots, "
        "exponentials, logarithms, and trig functions), so the answer uses a special function "
        "defined by an integral like this one.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_standard(rule, present):
    antiderivative = present(rule.eval())
    return make_step(
        STANDARD_LABELS.get(type(rule).__name__, "Standard integral"),
        rf"Differentiating \${to_latex(antiderivative)}$ gives \${to_latex(rule.integrand)}$, "
        "so it is an antiderivative.",
        [integral_of(rule.integrand, rule.variable), to_latex(antiderivative)],
    )


def explain_other(rule, present):
    name = re.sub(r"(?<!^)(?=[A-Z])", " ", type(rule).__name__).lower().capitalize()
    math = []
    if rule.integrand is not None:
        math = [integral_of(rule.integrand, rule.variable), result_latex(rule, present)]
    return make_step(name, "", math, [explain_rule(child, present) for child in child_rules(rule)])


EXPLAINERS = {
    manualintegrate.ConstantRule: explain_constant,
    manualintegrate.ConstantTimesRule: explain_constant_times,
    manualintegrate.PowerRule: explain_power,
    manualintegrate.ReciprocalRule: explain_reciprocal,
    manualintegrate.ExpRule: explain_exp,
    manualintegrate.AddRule: explain_add,
    manualintegrate.URule: explain_substitution,
    manualintegrate.PartsRule: explain_parts,
    manualintegrate.CyclicPartsRule: explain_cyclic_parts,
    manualintegrate.RewriteRule: explain_rewrite,
    manualintegrate.TrigSubstitutionRule: explain_trig_substitution,
    manualintegrate.AtomicRule: explain_standard,
}
for _rule_name in SPECIAL_FUNCTION_RULES:
    if hasattr(manualintegrate, _rule_name):
        EXPLAINERS[getattr(manualintegrate, _rule_name)] = explain_special_function
`,"./python/mathlab/integral_strategies.py":`"""Extra integration strategies, tried when the textbook rules alone fail.

SymPy's general algorithms can run for many minutes on integrals a student
could do by hand with the right rewrite. This module does those rewrites:

Trig with one angle. In 7 sin^2(2x+3) / cos^3(2x-3), substitute u = 2x - 3
(the angle in the denominator), expand sin(u + 6) with the angle-addition
formula, and write each term with tan and sec. The pieces are then standard
integrals. This finishes in about a second, while SymPy alone did not finish
in five minutes.
"""

import sympy
from sympy.integrals.manualintegrate import manualintegrate

from mathlab.expressions import X, differential_latex, to_latex
from mathlab.steps import make_step

U = sympy.Dummy("u", real=True)


def trig_angles(function):
    return {atom.args[0] for atom in function.atoms(sympy.sin, sympy.cos, sympy.tan, sympy.sec, sympy.csc, sympy.cot)}


def tan_sec_term(term):
    """sin(t)^a / cos(t)^b with b >= a becomes tan(t)^a sec(t)^(b - a);
    any other 1/cos(t)^b becomes sec(t)^b."""
    powers = term.as_powers_dict()
    for factor, exponent in powers.items():
        if isinstance(factor, sympy.cos) and exponent.is_negative:
            angle = factor.args[0]
            sine = sympy.sympify(powers.get(sympy.sin(angle), 0))
            cosine = -exponent
            if sine.is_nonnegative and sine <= cosine:
                rest = term / (sympy.sin(angle) ** sine * sympy.cos(angle) ** exponent)
                return rest * sympy.tan(angle) ** sine * sympy.sec(angle) ** (cosine - sine)
    return term


def with_tan_and_sec(expression):
    return sympy.Add(*(tan_sec_term(term) for term in sympy.Add.make_args(sympy.expand(expression))))


def finish_remaining_integrals(expression):
    """Do any integrals the textbook rules left undone; each is small by now."""
    return expression.replace(
        lambda part: isinstance(part, sympy.Integral),
        lambda part: sympy.integrate(part.function, *part.limits),
    )


def integrate_with_one_angle(function):
    """Return (antiderivative, steps), or None if this strategy doesn't apply.

    Applies when the trig functions' angles are linear in x with the same
    slope, like 2x + 3 and 2x - 3, and some trig function is in a denominator.
    """
    angles = trig_angles(function)
    linear = [angle for angle in angles if angle.is_polynomial(X) and sympy.degree(angle, X) == 1]
    if not angles or len(linear) != len(angles):
        return None
    slopes = {sympy.Poly(angle, X).coeffs()[0] for angle in linear}
    in_denominator = {
        power.base.args[0]
        for power in function.atoms(sympy.Pow)
        if power.exp.is_negative and isinstance(power.base, (sympy.sin, sympy.cos))
    }
    if len(slopes) != 1 or not in_denominator:
        return None
    slope = slopes.pop()
    angle = sorted(in_denominator, key=str)[0]
    x_in_terms_of_u = sympy.solve(sympy.Eq(angle, U), X)[0]
    expanded = sympy.expand(sympy.expand_trig(function.subs(X, x_in_terms_of_u) / slope))
    rewritten = with_tan_and_sec(expanded)
    in_u = finish_remaining_integrals(manualintegrate(rewritten, U))
    if in_u.has(sympy.Integral):
        return None
    antiderivative = in_u.subs(U, angle)
    steps = [
        make_step(
            "Substitution",
            rf"Let $u = {to_latex(angle)}$, the angle in the denominator, so "
            rf"$du = {differential_latex(slope, X)}$. Write every other angle in terms of $u$ "
            r"and expand it with the angle-addition formulas, such as "
            r"$\\sin(a + b) = \\sin a \\cos b + \\cos a \\sin b$.",
            [to_latex(sympy.Integral(function, X)), to_latex(sympy.Integral(expanded, U))],
        ),
        make_step(
            "Rewrite with tan and sec",
            r"Divide through by the cosines: $\\frac{\\sin u}{\\cos u} = \\tan u$ and "
            r"$\\frac{1}{\\cos u} = \\sec u$. Each term becomes a standard integral.",
            [to_latex(sympy.Integral(expanded, U)), to_latex(sympy.Integral(rewritten, U))],
        ),
        make_step(
            "Integrate term by term",
            r"Use the standard integrals of $\\sec u$, $\\sec u \\tan u$, $\\sec^{2} u$, and "
            r"$\\tan^{2} u \\sec u$ (by parts), then substitute "
            rf"$u = {to_latex(angle)}$ back.",
            [to_latex(sympy.Integral(rewritten, U)), to_latex(in_u), to_latex(antiderivative)],
        ),
    ]
    return antiderivative, steps
`,"./python/mathlab/latex_input.py":`"""Translate LaTeX from the math input box (MathLive) into text the parser reads.

The box shows real math, so the translation follows how a textbook reads what
is on screen: sin x cos x is sin(x)·cos(x), sin 2x is sin(2x), sin²x is
(sin x)², sin⁻¹x is arcsin x, and log₂ x is log base 2 of x. Only known
commands are translated; anything else is reported, never passed through.
"""

import re

from mathlab.expressions import InputError

TOKEN = re.compile(r"\\\\[A-Za-z]+|\\\\.|\\d+(?:\\.\\d+)?|\\S")

FUNCTIONS = {
    **{
        name: name
        for name in (
            "sin cos tan sec csc cot sinh cosh tanh coth arcsin arccos arctan ln log exp"
        ).split()
    },
    "arcsec": "arcsec",
    "arccsc": "arccsc",
    "arccot": "arccot",
}

# Functions whose -1 power means the inverse function: sin⁻¹ x is arcsin x.
INVERTIBLE = set("sin cos tan sec csc cot sinh cosh tanh".split())

# Functions spelled with \\operatorname{...}.
OPERATOR_NAMES = {
    "sech",
    "csch",
    "coth",
    "arcsec",
    "arccsc",
    "arccot",
    "arcsinh",
    "arccosh",
    "arctanh",
    "sgn",
    "sign",
    "erf",
    "floor",
    "ceil",
    "abs",
}

GREEK = {
    "alpha",
    "theta",
    "phi",
    "varphi",
    "omega",
    "lambda",
    "mu",
    "sigma",
    "tau",
    "rho",
    "delta",
    "epsilon",
    "varepsilon",
    "psi",
    "xi",
    "eta",
    "kappa",
    "nu",
}
GREEK_SPELLINGS = {"lambda": "lamda", "varphi": "phi", "varepsilon": "epsilon"}

SYMBOLS = {
    r"\\pi": "pi",
    r"\\infty": "oo",
    r"\\cdot": "*",
    r"\\times": "*",
    r"\\ast": "*",
    r"\\div": "/",
    r"\\exponentialE": "e",
    r"\\Gamma": "gamma",
    r"\\lvert": "|",
    r"\\rvert": "|",
    r"\\vert": "|",
    r"\\mid": "|",
}

# Spacing and size commands, which don't change the math (they can arrive in
# pasted LaTeX).
SPACING = {r"\\,", r"\\;", r"\\:", r"\\!", r"\\ ", r"\\quad", r"\\qquad", r"\\displaystyle", r"\\textstyle"}

# Brackets. \\mleft and \\mright are MathLive's spellings of \\left and \\right.
LEFT_COMMANDS = {r"\\left", r"\\mleft"}
RIGHT_COMMANDS = {r"\\right", r"\\mright"}
OPENING_TOKENS = {"(", "[", *LEFT_COMMANDS}
CLOSING_TOKENS = {")", "]", *RIGHT_COMMANDS}
ABSOLUTE_VALUE_BARS = {"|", r"\\vert", r"\\lvert"}

# A function's argument ends at these, so sin x cos x is sin(x)·cos(x).
ARGUMENT_ENDS = {"+", "-", "=", ",", "/", "}", r"\\cdot", r"\\times", r"\\div", *CLOSING_TOKENS}


class LatexReader:
    def __init__(self, latex):
        self.tokens = TOKEN.findall(latex)
        self.position = 0

    def peek(self):
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def take(self):
        token = self.peek()
        if token is None:
            raise InputError("The expression seems to be unfinished.")
        self.position += 1
        return token

    def skip_spacing(self):
        while self.peek() in SPACING:
            self.position += 1

    def read(self, stop=lambda token: False):
        """Read until stop(token) is true or the input ends; return plain text."""
        parts = []
        while True:
            self.skip_spacing()
            token = self.peek()
            if token is None or stop(token):
                return " ".join(parts)
            parts.append(self.atom())

    def group(self):
        """One argument: {...} or a single item, like the 2 in x^2."""
        self.skip_spacing()
        if self.peek() == "{":
            self.take()
            text = self.read(lambda token: token == "}")
            self.take()
            return text
        return self.atom()

    def delimited(self):
        """A bracketed group, as text with its brackets.

        Brackets pair up by counting, not by kind. The math box can store
        7(sin(2x+3))^2 as 7( \\\\sin\\\\left(2x+3) \\\\right)^2 -- the ) typed
        inside sin's brackets closes them, and sin's \\\\right) closes the
        first (. Pairing by kind would misread that; counting matches what
        is on screen.
        """
        token = self.take()
        is_absolute_value = False
        if token in LEFT_COMMANDS:
            bracket = self.take()
            is_absolute_value = bracket in ABSOLUTE_VALUE_BARS
        parts = []
        while True:
            self.skip_spacing()
            next_token = self.peek()
            if next_token is None:
                raise InputError("A bracket is never closed. Add the missing ).")
            if next_token in CLOSING_TOKENS:
                self.take()
                if next_token in RIGHT_COMMANDS:
                    self.take()  # The bracket's shape, such as ) or |.
                inner = " ".join(parts)
                return f"abs({inner})" if is_absolute_value else f"({inner})"
            parts.append(self.atom())

    def function(self, name):
        """A function and its argument, following textbook conventions."""
        self.skip_spacing()
        power = None
        base = None
        if self.peek() == "_" and name == "log":
            self.take()
            base = self.group()
        if self.peek() == "^":
            self.take()
            power = self.group()
        self.skip_spacing()
        if self.peek() in OPENING_TOKENS:
            argument = self.delimited()
        else:
            argument = f"({self.read(lambda token: token in ARGUMENT_ENDS or self.is_function(token))})"
            if argument == "()":
                raise InputError(f"{name} needs something to act on, like {name}(x).")
        if name in INVERTIBLE and power is not None and power.replace(" ", "") in ("-1", "(-1)"):
            # sin⁻¹ x means arcsin x, not 1/sin x.
            name, power = f"arc{name}", None
        call = f"log({argument}, {base})" if base is not None else f"{name}({argument})"
        return f"({call})^({power})" if power is not None else call

    def is_function(self, token):
        if token == r"\\operatorname":
            return True
        return token.startswith("\\\\") and token[1:] in FUNCTIONS

    def atom(self):
        token = self.take()
        if token in OPENING_TOKENS:
            self.position -= 1
            return self.delimited()
        if token in CLOSING_TOKENS or token == "}":
            raise InputError("There's an extra closing bracket.")
        if token == r"\\placeholder":
            raise InputError("Fill in the empty boxes first.")
        if token == "{":
            text = self.read(lambda next_token: next_token == "}")
            self.take()
            return f"({text})"
        if token == "^":
            return f"^({self.group()})"
        if token == "_":
            raise InputError("Subscripts aren't supported here, except in log_b.")
        if token in (r"\\frac", r"\\dfrac", r"\\tfrac"):
            numerator = self.group()
            denominator = self.group()
            return f"(({numerator})/({denominator}))"
        if token == r"\\sqrt":
            if self.peek() == "[":
                self.take()
                index = self.read(lambda next_token: next_token == "]")
                self.take()
                return f"root({self.group()}, {index})"
            return f"sqrt({self.group()})"
        if token == r"\\operatorname":
            name = self.group().replace(" ", "")
            if name not in OPERATOR_NAMES:
                raise InputError(f"I don't know the function {name} yet.")
            return self.function(name)
        if token in (r"\\mathrm", r"\\text", r"\\mathit"):
            text = self.group().replace(" ", "")
            if text in ("e", "d", "x", "y") or text in FUNCTIONS:
                return self.function(text) if text in FUNCTIONS else text
            raise InputError(f'I can\\'t read the text "{text}" here.')
        if token.startswith("\\\\") and token[1:] in FUNCTIONS:
            return self.function(FUNCTIONS[token[1:]])
        if token.startswith("\\\\") and token[1:] in GREEK:
            return GREEK_SPELLINGS.get(token[1:], token[1:])
        if token in SYMBOLS:
            return SYMBOLS[token]
        if token in SPACING:
            return ""
        if token.startswith("\\\\"):
            raise InputError(f"I can't read {token} yet.")
        return token


def latex_to_text(latex):
    """Plain text for the parser, from LaTeX typed in the math input box."""
    reader = LatexReader(latex)
    text = reader.read()
    if reader.peek() is not None:
        raise InputError("Check the brackets: one of them doesn't pair up.")
    return text
`,"./python/mathlab/line_integrals.py":`"""Line integrals along a curve r(t), a ≤ t ≤ b, in the plane or in space.\r
\r
A line integral of a function adds up f times length along the curve:\r
∫_C f ds = ∫_a^b f(r(t)) |r'(t)| dt. A line integral of a vector field adds up\r
the part of F along the curve, times length: ∫_C F · dr = ∫_a^b F(r(t)) · r'(t) dt,\r
the work F does on a particle moving along C.\r
\r
When F is conservative, F = ∇f for a potential function f, and the\r
fundamental theorem for line integrals gives ∫_C F · dr = f(r(b)) - f(r(a)):\r
the answer depends only on where the curve starts and ends.\r
"""\r
\r
import math\r
\r
import mpmath\r
import sympy\r
\r
from mathlab.checks import numeric_function\r
from mathlab.curves import (\r
    integrate_piece,\r
    latex_value,\r
    numerical_cross_check,\r
    numerical_integral,\r
    parse_curve_function,\r
    parse_interval,\r
)\r
from mathlab.expressions import X, Y, Z, T, InputError, to_latex\r
from mathlab.latex_input import latex_to_text\r
from mathlab.parsing import parse_function\r
from mathlab.progress import report\r
from mathlab.space_curves import magnitude, tidy\r
from mathlab.steps import make_step, separate\r
from mathlab.tangent import only_variables\r
from mathlab.vectors import vector_latex\r
\r
CHECK_DIGITS = 30\r
CHECK_TOLERANCE = mpmath.mpf("1e-12")\r
# An exact antiderivative is tried only for integrands with at most this many\r
# operations; longer ones are integrated numerically (as for arc length).\r
EXACT_LIMIT = 40\r
GRAPH_POINTS = 241\r
# Field arrows in the plane: a grid this many on a side, over the curve's box.\r
ARROW_GRID = 9\r
# The lesson picture: positions along the curve, and Simpson's rule with this\r
# many pieces between neighboring positions for the integral so far.\r
TRACE_STEPS = 60\r
SIMPSON_PIECES = 8\r
# Functions defined (and smooth) at every point, so a field built from them\r
# with curl 0 is conservative everywhere.\r
EVERYWHERE = (sympy.exp, sympy.sin, sympy.cos, sympy.sinh, sympy.cosh)\r
\r
\r
def parse_component(text, name, variables):\r
    if not isinstance(text, str) or text.strip() == "":\r
        raise InputError(f"Enter {name}.")\r
    try:\r
        component = parse_function(latex_to_text(text), (X, Y, Z))\r
    except InputError as error:\r
        raise InputError(f"{name}: {error}") from error\r
    if Z not in variables and component.has(Z):\r
        raise InputError("The curve is in the plane (no z(t)), so F can use only x and y.")\r
    only_variables(component, variables, name)\r
    return component\r
\r
\r
def parse_problem(request):\r
    """The curve r(t), its interval, the variables, and the integrand: f for\r
    ∫ f ds, or the components of F for ∫ F · dr."""\r
    kind = request.get("lineKind")\r
    if kind not in ("scalar", "vector"):\r
        raise InputError("Choose a line integral of a function, ∫ f ds, or of a vector field, ∫ F · dr.")\r
    z_text = request.get("zExpression")\r
    space = isinstance(z_text, str) and z_text.strip() != ""\r
    keys = (("xExpression", "x(t)"), ("yExpression", "y(t)")) + ((("zExpression", "z(t)"),) if space else ())\r
    position = sympy.Matrix([parse_curve_function(request.get(key), name, T) for key, name in keys])\r
    interval = parse_interval(request.get("lower"), request.get("upper"), T)\r
    variables = (X, Y, Z) if space else (X, Y)\r
    if kind == "scalar":\r
        text = request.get("expression")\r
        if request.get("format") == "latex" and isinstance(text, str):\r
            text = latex_to_text(text)\r
        if not isinstance(text, str) or text.strip() == "":\r
            raise InputError("Enter the function f to integrate along the curve.")\r
        integrand = parse_function(text, (X, Y, Z))\r
        if not space and integrand.has(Z):\r
            raise InputError("The curve is in the plane (no z(t)), so f can use only x and y.")\r
        only_variables(integrand, variables, "f")\r
    else:\r
        texts = list(request.get("fieldLatex") or [])\r
        texts += [""] * (len(variables) - len(texts))\r
        names = ("P", "Q", "R")\r
        if not space and len(texts) > 2 and isinstance(texts[2], str) and texts[2].strip():\r
            raise InputError("The curve is in the plane (no z(t)), so F has only two components, P and Q.")\r
        integrand = sympy.Matrix(\r
            [parse_component(texts[index], names[index], variables) for index in range(len(variables))]\r
        )\r
    return kind, position, interval, variables, integrand\r
\r
\r
def along_curve(expression, variables, position):\r
    return expression.subs(dict(zip(variables, position)), simultaneous=True)\r
\r
\r
def defined_everywhere(expression):\r
    """Whether the expression is built only from functions defined and smooth\r
    at every point: polynomials, e^x, sin, cos, sinh, cosh."""\r
    for node in sympy.preorder_traversal(expression):\r
        if isinstance(node, sympy.Pow) and node.base.free_symbols:\r
            if not (node.exp.is_Integer and node.exp >= 0):\r
                return False\r
        elif isinstance(node, sympy.Function) and not isinstance(node, EVERYWHERE):\r
            return False\r
    return True\r
\r
\r
def trig_arguments(expression):\r
    return {\r
        node.args[0]\r
        for node in sympy.preorder_traversal(expression)\r
        if isinstance(node, sympy.functions.elementary.trigonometric.TrigonometricFunction)\r
    }\r
\r
\r
def gentle(expression):\r
    """Simplified, unless that brings in new angles: sin²t + cos²t becomes 1,\r
    but -sin t cos t stays as it is instead of becoming -sin(2t)/2."""\r
    simpler = tidy(expression)\r
    if trig_arguments(simpler) <= trig_arguments(expression) and sympy.count_ops(simpler) <= sympy.count_ops(\r
        expression\r
    ):\r
        return simpler\r
    return expression\r
\r
\r
def fraction_form(expression):\r
    """A derivative over one denominator, factored, so two equal ones look equal."""\r
    numerator, denominator = sympy.fraction(sympy.together(expression))\r
    return sympy.expand(numerator) / sympy.factor(denominator)\r
\r
\r
def curl(field, variables):\r
    if len(variables) == 2:\r
        P, Q = field\r
        return [sympy.simplify(sympy.diff(Q, X) - sympy.diff(P, Y))]\r
    P, Q, R = field\r
    return [\r
        sympy.simplify(sympy.diff(R, Y) - sympy.diff(Q, Z)),\r
        sympy.simplify(sympy.diff(P, Z) - sympy.diff(R, X)),\r
        sympy.simplify(sympy.diff(Q, X) - sympy.diff(P, Y)),\r
    ]\r
\r
\r
def conservative_test(field, variables):\r
    """Whether F is conservative everywhere, and the step that shows the test."""\r
    everywhere = all(defined_everywhere(component) for component in field)\r
    differences = curl(field, variables)\r
    zero = all(difference == 0 for difference in differences)\r
    if len(variables) == 2:\r
        P, Q = field\r
        math = [\r
            rf"\\frac{{\\partial P}}{{\\partial y}} = {to_latex(fraction_form(sympy.diff(P, Y)))}, \\quad "\r
            rf"\\frac{{\\partial Q}}{{\\partial x}} = {to_latex(fraction_form(sympy.diff(Q, X)))}"\r
        ]\r
        test = r"$\\frac{\\partial Q}{\\partial x} = \\frac{\\partial P}{\\partial y}$"\r
    else:\r
        math = [rf"\\nabla \\times \\mathbf{{F}} = {vector_latex(differences)}"]\r
        test = r"$\\nabla \\times \\mathbf{F} = \\mathbf{0}$ (the curl)"\r
    if zero and everywhere:\r
        verdict = (\r
            rf"{test} holds, and $\\mathbf{{F}}$ is defined everywhere, so $\\mathbf{{F}}$ is "\r
            r"conservative: $\\mathbf{F} = \\nabla f$ for a potential function $f$."\r
        )\r
    elif zero:\r
        verdict = (\r
            rf"{test} holds, but $\\mathbf{{F}}$ isn't defined everywhere, so the test doesn't "\r
            r"prove it conservative (it may circle a point where it is undefined). Integrate directly."\r
        )\r
    else:\r
        verdict = (\r
            rf"A conservative field has {test}. That fails here, so $\\mathbf{{F}}$ isn't "\r
            r"conservative and the integral may depend on the path: integrate along this one."\r
        )\r
    step = make_step("Test for a conservative field", verdict, math)\r
    return zero and everywhere, step\r
\r
\r
def potential_function(field, variables):\r
    """f with ∇f = F, found one variable at a time: the steps and f, or None.\r
    What integrating in x leaves undetermined is a function g of the other\r
    variables; matching the y-component finds g up to a function h of z."""\r
    names = [to_latex(variable) for variable in variables]\r
    component_names = ("P", "Q", "R")\r
    potential = sympy.integrate(field[0], variables[0])\r
    if potential.has(sympy.Integral):\r
        return None\r
    steps = [\r
        make_step(\r
            f"Integrate P with respect to {names[0]}",\r
            rf"$f_{names[0]} = P$, so $f$ is an antiderivative of $P$ in \${names[0]}$, plus anything "\r
            rf"that doesn't depend on \${names[0]}$: a function \${unknown_function('g', names[1:])}$.",\r
            [\r
                rf"f = \\int {grouped(field[0])} \\, d{names[0]} = {to_latex(potential)} + "\r
                rf"{unknown_function('g', names[1:])}"\r
            ],\r
        )\r
    ]\r
    for index in range(1, len(variables)):\r
        variable, name = variables[index], names[index]\r
        letter = "gh"[index - 1]\r
        unknown = unknown_function(letter, names[index:])\r
        derivative = rf"{letter}'({name})" if index == len(variables) - 1 else rf"{letter}_{name}"\r
        needed = sympy.simplify(field[index] - sympy.diff(potential, variable))\r
        if needed.free_symbols & set(variables[:index]):\r
            return None\r
        added = sympy.integrate(needed, variable)\r
        if added.has(sympy.Integral):\r
            return None\r
        later = names[index + 1 :]\r
        remainder = rf" + {unknown_function('h', later)}" if later else ""\r
        known = sympy.diff(potential, variable)\r
        steps.append(\r
            make_step(\r
                f"Match the {name}-component",\r
                rf"Differentiate $f$ with respect to \${name}$ and set it equal to "\r
                rf"\${component_names[index]}$. What is left over is the derivative of \${unknown}$; "\r
                r"integrate it.",\r
                [\r
                    separate(\r
                        rf"f_{name} = {to_latex(known) + ' + ' if known != 0 else ''}{derivative} = "\r
                        rf"{to_latex(field[index])} \\quad\\Longrightarrow\\quad {derivative} = {to_latex(needed)}",\r
                        rf"{unknown} = {to_latex(added)}{remainder}",\r
                    )\r
                ],\r
            )\r
        )\r
        potential = sympy.expand(potential + added)\r
    if any(sympy.simplify(sympy.diff(potential, v) - c) != 0 for v, c in zip(variables, field)):\r
        return None\r
    steps.append(\r
        make_step(\r
            "Potential function",\r
            r"Any constant could be added; $0$ is simplest. Check: $\\nabla f = \\mathbf{F}$.",\r
            [rf"f({', '.join(names)}) = {to_latex(potential)}"],\r
        )\r
    )\r
    return potential, steps\r
\r
\r
def unknown_function(letter, names):\r
    return rf"{letter}({', '.join(names)})"\r
\r
\r
def grouped(expression):\r
    """An integrand in parentheses when it is a sum, as in ∫ (2xy + 3) dx."""\r
    text = to_latex(expression)\r
    return rf"\\left({text}\\right)" if expression.is_Add else text\r
\r
\r
def is_transcendental(expression):\r
    """A function of t other than a polynomial's pieces: sin t, e^t, √t."""\r
    return expression.has(T) and (\r
        isinstance(expression, sympy.Function) or (isinstance(expression, sympy.Pow) and not expression.exp.is_Integer)\r
    )\r
\r
\r
def has_nested_functions(expression):\r
    """Whether a function is applied to something transcendental, as in\r
    e^{sin(3 cos t)} or √(81 sin⁴t + 1). SymPy's general algorithms almost\r
    never find an antiderivative for these, and spent 44 seconds failing on\r
    Stewart's e^{sin x} and √(y⁴ + 1) around a circle; the textbook rules\r
    still get their (quick) try, which handles e^{sin t} cos t."""\r
    for node in sympy.preorder_traversal(expression):\r
        if not is_transcendental(node):\r
            continue\r
        inside = node.args[0] if isinstance(node, sympy.Function) else node.base\r
        if any(is_transcendental(part) for part in sympy.preorder_traversal(inside)):\r
            return True\r
    return False\r
\r
\r
def integrate_along(integrand, interval):\r
    """∫ integrand dt over the interval: the step's math and substeps, the exact\r
    value (None if only numerical), and the numerical value."""\r
    low, high = interval\r
    as_numeric = numeric_function(integrand, (T,))\r
    numeric = numerical_integral(as_numeric, [low, high])\r
    if sympy.count_ops(integrand) <= EXACT_LIMIT:\r
        try:\r
            general = not has_nested_functions(integrand)\r
            step, value = integrate_piece(integrand, T, low, high, general=general)\r
            # A hypergeometric "exact" answer tells a student less than a decimal.\r
            if not value.has(sympy.hyper, sympy.meijerg):\r
                return [step], value, numeric\r
        except InputError:\r
            pass\r
    if numeric is None:\r
        raise InputError("The line integral couldn't be computed, even numerically.")\r
    note = make_step(\r
        "Numerical integration",\r
        "No antiderivative was found with the textbook rules, so the integral was computed numerically.",\r
        [],\r
    )\r
    return [note], None, numeric\r
\r
\r
def independent_integrand(kind, integrand, variables, position):\r
    """The integrand in t, evaluated straight from the typed f or F and the\r
    curve's derivatives, without the simplified formula the steps use."""\r
    point = [numeric_function(component, (T,)) for component in position]\r
    velocity = [numeric_function(sympy.diff(component, T), (T,)) for component in position]\r
    if kind == "scalar":\r
        f = numeric_function(integrand, variables)\r
        return lambda t: f(*(c(t) for c in point)) * mpmath.sqrt(sum(v(t) ** 2 for v in velocity))\r
    components = [numeric_function(component, variables) for component in integrand]\r
    return lambda t: sum(\r
        component(*(c(t) for c in point)) * v(t) for component, v in zip(components, velocity)\r
    )\r
\r
\r
def value_check(kind, integrand, variables, position, interval, exact, numeric_shown):\r
    as_numeric = independent_integrand(kind, integrand, variables, position)\r
    numeric = numerical_integral(as_numeric, list(interval))\r
    if exact is None:\r
        return numerical_cross_check(as_numeric, list(interval), numeric, numeric_shown) if numeric is not None else {\r
            "status": "unchecked",\r
            "detail": "The integral couldn't be checked numerically.",\r
        }\r
    if numeric is None:\r
        return {"status": "unchecked", "detail": "The integral couldn't be checked numerically."}\r
    with mpmath.workdps(CHECK_DIGITS):\r
        expected = mpmath.mpf(str(sympy.N(exact, CHECK_DIGITS)))\r
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")\r
        if abs(numeric - expected) <= CHECK_TOLERANCE * max(1, abs(expected)):\r
            return {\r
                "status": "verified",\r
                "detail": f"Integrating numerically along the curve, straight from the typed "\r
                f"{'function' if kind == 'scalar' else 'field'} and curve, gives \${shown}$, matching the exact answer.",\r
            }\r
    return {\r
        "status": "failed",\r
        "detail": f"Integrating numerically along the curve gives \${shown}$, which doesn't match. "\r
        "Treat this answer with caution.",\r
    }\r
\r
\r
def solve_line_integral(kind, position, interval, variables, integrand):\r
    """The steps, the value (exact, or None), its numerical value, and for a\r
    conservative field the potential function."""\r
    low, high = interval\r
    velocity = position.diff(T)\r
    steps = [\r
        make_step(\r
            "Velocity",\r
            r"Differentiate each component of $\\mathbf{r}(t)$.",\r
            [rf"\\mathbf{{r}}'(t) = {vector_latex(velocity)}"],\r
        )\r
    ]\r
    bounds = rf"_{{{to_latex(low)}}}^{{{to_latex(high)}}}"\r
    potential = None\r
    if kind == "vector":\r
        is_conservative, test_step = conservative_test(integrand, variables)\r
        steps.append(test_step)\r
        found = potential_function(integrand, variables) if is_conservative else None\r
        if found is not None:\r
            potential, potential_steps = found\r
            steps.extend(potential_steps)\r
            start = sympy.simplify(along_curve(potential, variables, position.subs(T, low)))\r
            end = sympy.simplify(along_curve(potential, variables, position.subs(T, high)))\r
            value = sympy.simplify(end - start)\r
            start_point = position.subs(T, low).applyfunc(sympy.simplify)\r
            end_point = position.subs(T, high).applyfunc(sympy.simplify)\r
            steps.append(\r
                make_step(\r
                    "Fundamental theorem for line integrals",\r
                    r"For $\\mathbf{F} = \\nabla f$, $\\int_C \\nabla f \\cdot d\\mathbf{r} = "\r
                    r"f(\\mathbf{r}(b)) - f(\\mathbf{r}(a))$: only the ends of the curve matter. "\r
                    rf"It starts at $\\mathbf{{r}}({to_latex(low)}) = {vector_latex(start_point)}$ and ends at "\r
                    rf"$\\mathbf{{r}}({to_latex(high)}) = {vector_latex(end_point)}$.",\r
                    [\r
                        r"\\int_C \\mathbf{F} \\cdot d\\mathbf{r}",\r
                        rf"f{point_text(end_point)} - f{point_text(start_point)}",\r
                        rf"{to_latex(end)} - {parenthesized(start)}",\r
                        latex_value(value),\r
                    ],\r
                )\r
            )\r
            numeric = numerical_integral(\r
                independent_integrand(kind, integrand, variables, position), [low, high]\r
            )\r
            return {"steps": steps, "value": value, "numeric": numeric, "potential": potential}\r
        on_curve = along_curve(integrand, variables, position).applyfunc(gentle)\r
        product = gentle(sympy.expand(on_curve.dot(velocity)))\r
        steps.append(\r
            make_step(\r
                "Field along the curve",\r
                r"Put $x(t)$, $y(t)$" + (r", $z(t)$" if len(variables) == 3 else "") + r" into $\\mathbf{F}$.",\r
                [rf"\\mathbf{{F}}(\\mathbf{{r}}(t)) = {vector_latex(on_curve)}"],\r
            )\r
        )\r
        steps.append(\r
            make_step(\r
                "Dot product with the velocity",\r
                r"$\\mathbf{F} \\cdot d\\mathbf{r} = \\mathbf{F}(\\mathbf{r}(t)) \\cdot \\mathbf{r}'(t)\\,dt$: "\r
                r"the part of the field along the motion, times the distance moved.",\r
                [rf"{vector_latex(on_curve)} \\cdot {vector_latex(velocity)}", to_latex(product)],\r
            )\r
        )\r
        formula = rf"\\int_C \\mathbf{{F}} \\cdot d\\mathbf{{r}} = \\int{bounds} \\mathbf{{F}}(\\mathbf{{r}}(t)) \\cdot \\mathbf{{r}}'(t)\\, dt"\r
    else:\r
        speed = tidy(magnitude(velocity))\r
        on_curve = gentle(along_curve(integrand, variables, position))\r
        product = gentle(on_curve * speed)\r
        steps.append(\r
            make_step(\r
                "Speed",\r
                r"$ds = |\\mathbf{r}'(t)|\\,dt$: over a short time $dt$ the point moves a distance "\r
                r"$|\\mathbf{r}'(t)|\\,dt$.",\r
                [rf"|\\mathbf{{r}}'(t)| = \\sqrt{{{to_latex(sympy.expand(velocity.dot(velocity)))}}}", to_latex(speed)],\r
            )\r
        )\r
        steps.append(\r
            make_step(\r
                "Function along the curve",\r
                r"Put $x(t)$, $y(t)$" + (r", $z(t)$" if len(variables) == 3 else "") + r" into $f$.",\r
                [rf"f(\\mathbf{{r}}(t)) = {to_latex(on_curve)}"],\r
            )\r
        )\r
        formula = rf"\\int_C f\\, ds = \\int{bounds} f(\\mathbf{{r}}(t))\\, |\\mathbf{{r}}'(t)|\\, dt"\r
    report("Integrating along the curve…")\r
    substeps, value, numeric = integrate_along(product, interval)\r
    math = [formula, to_latex(sympy.Integral(product, (T, low, high)))]\r
    math.append(latex_value(value) if value is not None else rf"\\approx {mpmath.nstr(numeric, 10)}")\r
    steps.append(\r
        make_step(\r
            "Integrate",\r
            r"The line integral is now an ordinary integral in $t$ from $a$ to $b$.",\r
            math,\r
            substeps,\r
        )\r
    )\r
    return {"steps": steps, "value": value, "numeric": numeric, "potential": potential}\r
\r
\r
def point_text(point):\r
    return rf"\\left({', '.join(to_latex(value) for value in point)}\\right)"\r
\r
\r
def parenthesized(value):\r
    text = to_latex(value)\r
    return rf"\\left({text}\\right)" if value.could_extract_minus_sign() or value.is_Add else text\r
\r
\r
def field_arrows(field, variables, xs, ys):\r
    """F at a grid of points over the curve's box, for drawing arrows."""\r
    as_float = [sympy.lambdify(variables, component, modules="math") for component in field]\r
    low_x, high_x, low_y, high_y = min(xs), max(xs), min(ys), max(ys)\r
    pad = 0.15 * max(high_x - low_x, high_y - low_y, 1)\r
    low_x, high_x, low_y, high_y = low_x - pad, high_x + pad, low_y - pad, high_y + pad\r
    arrows = []\r
    for i in range(ARROW_GRID):\r
        for j in range(ARROW_GRID):\r
            x = low_x + (high_x - low_x) * i / (ARROW_GRID - 1)\r
            y = low_y + (high_y - low_y) * j / (ARROW_GRID - 1)\r
            try:\r
                u, v = (float(component(x, y)) for component in as_float)\r
            except (ValueError, ZeroDivisionError, OverflowError, TypeError):\r
                continue\r
            if math.isfinite(u) and math.isfinite(v):\r
                arrows.append([round(x, 6), round(y, 6), round(u, 6), round(v, 6)])\r
    return arrows\r
\r
\r
def curve_samples(position, interval, count):\r
    low, high = (float(sympy.N(bound)) for bound in interval)\r
    functions = [sympy.lambdify(T, component, modules="math") for component in position]\r
    ts = [low + (high - low) * index / (count - 1) for index in range(count)]\r
    return ts, [[round(float(function(t)), 6) for t in ts] for function in functions]\r
\r
\r
def line_graph(kind, position, interval, variables, integrand):\r
    _, coordinates = curve_samples(position, interval, GRAPH_POINTS)\r
    graph = {"curve": coordinates, "arrows": None}\r
    if kind == "vector" and len(variables) == 2:\r
        graph["arrows"] = field_arrows(integrand, variables, coordinates[0], coordinates[1])\r
    return graph\r
\r
\r
def line_integral(request):\r
    kind, position, interval, variables, integrand = parse_problem(request)\r
    low, high = interval\r
    solved = solve_line_integral(kind, position, interval, variables, integrand)\r
    value, numeric = solved["value"], solved["numeric"]\r
    shown = latex_value(value) if value is not None else rf"\\approx {mpmath.nstr(numeric, 10)}"\r
    symbol = r"\\int_C \\mathbf{F} \\cdot d\\mathbf{r}" if kind == "vector" else r"\\int_C f\\, ds"\r
    results = [{"label": "Line integral", "latex": f"{symbol} {'=' if value is not None else ''} {shown}"}]\r
    if solved["potential"] is not None:\r
        names = ", ".join(to_latex(variable) for variable in variables)\r
        results.append({"label": "Potential function", "latex": rf"f({names}) = {to_latex(solved['potential'])}"})\r
    report("Checking the answer numerically…")\r
    check = value_check(\r
        kind, integrand, variables, position, interval, value, mpmath.nstr(numeric, 10) if numeric is not None else ""\r
    )\r
    curve = rf"\\mathbf{{r}}(t) = {vector_latex(position)}, \\quad {to_latex(low)} \\le t \\le {to_latex(high)}"\r
    given = (\r
        rf"\\mathbf{{F}} = {vector_latex(integrand)}" if kind == "vector" else rf"f = {to_latex(integrand)}"\r
    )\r
    return {\r
        "ok": True,\r
        "operation": "line",\r
        "kind": kind,\r
        "problemLatex": rf"{symbol}, \\quad {given}, \\quad {curve}",\r
        "results": results,\r
        "checks": [{"label": "Line integral", "check": check}],\r
        "steps": solved["steps"],\r
        "graph": line_graph(kind, position, interval, variables, integrand),\r
    }\r
\r
\r
def simpson(function, low, high, pieces):\r
    width = (high - low) / pieces\r
    total = function(low) + function(high)\r
    for index in range(1, pieces):\r
        total += (4 if index % 2 else 2) * function(low + index * width)\r
    return total * width / 3\r
\r
\r
def line_trace(request):\r
    """The lesson picture, for F in the plane: field arrows, the curve, and at\r
    each of TRACE_STEPS + 1 times the point, F, r', and the integral so far\r
    (and f(r(t)) - f(r(a)) when F has a potential f)."""\r
    request = {**request, "lineKind": "vector"}\r
    kind, position, interval, variables, field = parse_problem(request)\r
    if len(variables) != 2:\r
        raise InputError("The picture is for curves in the plane.")\r
    velocity = position.diff(T)\r
    as_float = [sympy.lambdify(T, expression, modules="math") for expression in (*position, *velocity)]\r
    field_float = [sympy.lambdify(variables, component, modules="math") for component in field]\r
\r
    def integrand(t):\r
        x, y, dx, dy = (function(t) for function in as_float)\r
        return field_float[0](x, y) * dx + field_float[1](x, y) * dy\r
\r
    potential = None\r
    is_conservative, _ = conservative_test(field, variables)\r
    if is_conservative:\r
        found = potential_function(field, variables)\r
        if found is not None:\r
            potential = sympy.lambdify(variables, found[0], modules="math")\r
    ts, _ = curve_samples(position, interval, TRACE_STEPS + 1)\r
    samples, total = [], 0.0\r
    for index, t in enumerate(ts):\r
        if index > 0:\r
            total += simpson(integrand, ts[index - 1], t, SIMPSON_PIECES)\r
        x, y, dx, dy = (function(t) for function in as_float)\r
        sample = {\r
            "t": round(t, 6),\r
            "point": [round(x, 6), round(y, 6)],\r
            "field": [round(f(x, y), 6) for f in field_float],\r
            "velocity": [round(dx, 6), round(dy, 6)],\r
            "integral": round(total, 6),\r
            "potential": None,\r
        }\r
        if potential is not None:\r
            start = position.subs(T, interval[0])\r
            sample["potential"] = round(potential(x, y) - potential(*(float(sympy.N(c)) for c in start)), 6)\r
        samples.append(sample)\r
    _, (cx, cy) = curve_samples(position, interval, GRAPH_POINTS)\r
    return {\r
        "ok": True,\r
        "operation": "lineTrace",\r
        "curve": {"x": cx, "y": cy},\r
        "arrows": field_arrows(field, variables, cx, cy),\r
        "samples": samples,\r
        "conservative": potential is not None,\r
    }\r
`,"./python/mathlab/multivariable.py":`"""Functions of two variables: partial derivatives, the gradient, and surface samples."""

import math

import mpmath
import sympy

from mathlab.checks import check_partial_derivative, check_with_constants, numeric_function, plot_value
from mathlab.derivative_steps import Differentiation, derivative_with_steps
from mathlab.expressions import X, Y, InputError, to_latex

VARIABLES = (X, Y)
MAX_POINT_COORDINATE = 1_000_000

# The surface is drawn on a square centered at the chosen point. Half-widths
# are tried largest first: a steep function like e^(xy) gets a smaller square,
# so huge values far away don't flatten the surface near the point.
SURFACE_HALF_WIDTHS = (3.0, 1.5, 0.75)
SURFACE_POINT_COUNT = 41
# A square is used when its values spread at most this many times as much as
# the values in its middle third.
MAX_SPREAD_RATIO = 20


def is_number(value):
    # JSON true/false arrive as bools, which Python also counts as ints.
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_point(raw):
    """Read the point (a, b) as exact numbers, so 0.5 becomes 1/2."""
    if not (isinstance(raw, list) and len(raw) == 2 and all(is_number(value) for value in raw)):
        raise InputError("Enter the point as two numbers, x and y.")
    if any(abs(value) > MAX_POINT_COORDINATE for value in raw):
        raise InputError(f"Keep the point's coordinates between -{MAX_POINT_COORDINATE:,} and {MAX_POINT_COORDINATE:,}.")
    return tuple(sympy.Rational(str(value)) for value in raw)


def exact_real(expression):
    """Return (exact value, float) for a number like 4 + 2 cos(2), or None if it
    is undefined, infinite, or not real."""
    value = sympy.simplify(expression)
    if value.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        return None
    try:
        number = complex(value.evalf())
    except TypeError:  # Something symbolic remained, so there is no number.
        return None
    if not math.isfinite(number.real) or abs(number.imag) > 1e-12 * max(1, abs(number.real)):
        return None
    return value, number.real


def decimal(number):
    return f"{number:.4g}"


def point_latex(point):
    return rf"\\left({to_latex(point[0])}, {to_latex(point[1])}\\right)"


def partial_derivative(function, variable):
    d = Differentiation(variable, partial=True)
    derivative, steps, steps_note = derivative_with_steps(function, d, VARIABLES)
    return derivative, {
        "variable": d.name,
        "equationLatex": rf"f_{{{d.name}}} = {d.of(function)} = {to_latex(derivative)}",
        "resultText": str(derivative),
        "check": check_with_constants(
            lambda f, result: check_partial_derivative(f, result, variable),
            function,
            derivative,
            VARIABLES,
        ),
        "steps": steps,
        "stepsNote": steps_note,
    }


def gradient_with_constants(partials, substitutions, at):
    """The gradient when f has constants like a: exact, with no decimals."""
    exact = [sympy.simplify(partial.subs(substitutions)) for partial in partials]
    vector = rf"\\left\\langle {to_latex(exact[0])},\\ {to_latex(exact[1])} \\right\\rangle"
    length = sympy.simplify(sympy.sqrt(exact[0] ** 2 + exact[1] ** 2))
    return {
        "ok": True,
        "latex": rf"\\nabla f{at} = {vector}",
        "lengthLatex": rf"\\left\\lVert \\nabla f{at} \\right\\rVert = {to_latex(length)}",
        "vector": None,
    }


def gradient_at(function, partials, point):
    substitutions = dict(zip(VARIABLES, point))
    at = point_latex(point)
    if function.free_symbols - set(VARIABLES):
        return gradient_with_constants(partials, substitutions, at)
    components = [exact_real(partial.subs(substitutions)) for partial in partials]
    if exact_real(function.subs(substitutions)) is None or None in components:
        return {
            "ok": False,
            "detail": f"f or one of its partial derivatives isn't defined at \${at}$, "
            "so the gradient doesn't exist there. Try another point.",
        }
    exact = [value for value, _ in components]
    numbers = [number for _, number in components]
    vector = rf"\\left\\langle {to_latex(exact[0])},\\ {to_latex(exact[1])} \\right\\rangle"
    gradient = rf"\\nabla f{at} = {vector}"
    if not all(value.is_Rational for value in exact):
        gradient += rf" \\approx \\left\\langle {decimal(numbers[0])},\\ {decimal(numbers[1])} \\right\\rangle"
    length = sympy.sqrt(exact[0] ** 2 + exact[1] ** 2)
    length_latex = rf"\\left\\lVert \\nabla f{at} \\right\\rVert = {to_latex(length)}"
    if not length.is_Rational:
        length_latex += rf" \\approx {decimal(math.hypot(*numbers))}"
    return {"ok": True, "latex": gradient, "lengthLatex": length_latex, "vector": numbers}


def spread(values):
    """How far apart the values are, ignoring the top and bottom 2%."""
    finite = sorted(value for value in values if value is not None)
    if len(finite) < 2:
        return 0.0
    last = len(finite) - 1
    return finite[int(0.98 * last)] - finite[int(0.02 * last)]


def sample_square(as_numeric, center, half_width):
    xs, ys = (
        [
            round(float(middle) - half_width + 2 * half_width * index / (SURFACE_POINT_COUNT - 1), 6)
            for index in range(SURFACE_POINT_COUNT)
        ]
        for middle in center
    )
    # Plotly's surface takes rows of z values, one row for each y.
    z = [[plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in xs] for y in ys]
    return xs, ys, z


def sample_surface(function, center):
    as_numeric = numeric_function(function, VARIABLES)
    middle = slice(SURFACE_POINT_COUNT // 3, 2 * SURFACE_POINT_COUNT // 3 + 1)
    for half_width in SURFACE_HALF_WIDTHS:
        xs, ys, z = sample_square(as_numeric, center, half_width)
        all_values = [value for row in z for value in row]
        middle_values = [value for row in z[middle] for value in row[middle]]
        if spread(all_values) <= MAX_SPREAD_RATIO * max(spread(middle_values), 1e-9):
            break
    value_at_point = exact_real(function.subs(dict(zip(VARIABLES, center))))
    return {
        "x": xs,
        "y": ys,
        "z": z,
        "point": [float(center[0]), float(center[1]), value_at_point[1] if value_at_point else None],
    }


# The lesson's slice picture: a fixed square around the point, and tangent
# lines reaching this far on each side.
SLICE_HALF_WIDTH = 2.0
TANGENT_REACH = 1.0


def curve_points(as_numeric, xs, ys):
    return {
        "x": xs,
        "y": ys,
        "z": [plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x, y in zip(xs, ys)],
    }


def slices(function, point):
    """The surface near (a, b), its slices along y = b and x = a, and their
    tangent lines, whose slopes are f_x(a, b) and f_y(a, b)."""
    if function.free_symbols - set(VARIABLES):
        raise InputError("The picture needs numbers, so use only x and y here.")
    a, b = point
    as_numeric = numeric_function(function, VARIABLES)
    xs, ys, z = sample_square(as_numeric, point, SLICE_HALF_WIDTH)
    substitutions = {X: a, Y: b}
    height = exact_real(function.subs(substitutions))
    slopes = [exact_real(sympy.diff(function, variable).subs(substitutions)) for variable in VARIABLES]
    if height is None or None in slopes:
        raise InputError("f or one of its partial derivatives isn't defined at that point. Move the point.")
    z0 = height[1]
    slope_x, slope_y = (slope[1] for slope in slopes)
    a_value, b_value = float(a), float(b)
    reach = TANGENT_REACH
    return {
        "ok": True,
        "operation": "slices",
        "surface": {"x": xs, "y": ys, "z": z, "point": [a_value, b_value, z0]},
        "xSlice": curve_points(as_numeric, xs, [b_value] * len(xs)),
        "ySlice": curve_points(as_numeric, [a_value] * len(ys), ys),
        "xTangent": {
            "x": [a_value - reach, a_value + reach],
            "y": [b_value, b_value],
            "z": [z0 - reach * slope_x, z0 + reach * slope_x],
        },
        "yTangent": {
            "x": [a_value, a_value],
            "y": [b_value - reach, b_value + reach],
            "z": [z0 - reach * slope_y, z0 + reach * slope_y],
        },
        "values": {"f": z0, "fx": slope_x, "fy": slope_y},
    }


def partial_derivatives(function, point):
    results = [partial_derivative(function, variable) for variable in VARIABLES]
    partials = [derivative for derivative, _ in results]
    constants = sorted(function.free_symbols - set(VARIABLES), key=str)
    return {
        "ok": True,
        "operation": "partial",
        "functionLatex": rf"f(x, y) = {to_latex(function)}",
        "constants": [to_latex(constant) for constant in constants],
        "partials": [details for _, details in results],
        "gradient": gradient_at(function, partials, point),
        # With constants like a there is no single surface to draw.
        "surface": None if constants else sample_surface(function, point),
    }
`,"./python/mathlab/optimize.py":`"""Maximum and minimum values of functions of several variables.

Critical points: where ∇f = 0. The second-derivative test classifies a critical
point of f(x, y) with D = f_xx f_yy - f_xy²: a local minimum if D > 0 and
f_xx > 0, a local maximum if D > 0 and f_xx < 0, a saddle point if D < 0, and
no conclusion if D = 0.

Lagrange multipliers: the extreme values of f on a constraint g = k are among
the points where ∇f = λ∇g (and the points where ∇g = 0). On a closed, bounded
curve or surface, like an ellipse or a sphere, f has a largest and a smallest
value, so they are the largest and smallest values at those points.
"""

import math

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.derivative_steps import Differentiation, derivative_with_steps
from mathlab.directional import gradient_steps, latex_value, number
from mathlab.expressions import X, Y, Z, T, InputError, to_latex
from mathlab.multivariable import sample_square
from mathlab.progress import report
from mathlab.steps import make_step, separate
from mathlab.tangent import only_variables

LAMBDA = sympy.Symbol("lambda", real=True)
CHECK_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")
# The second-derivative test is checked by comparing f at the point with f at
# this many points on a small circle around it.
NEIGHBOR_COUNT = 72
NEIGHBOR_RADIUS = mpmath.mpf("1e-4")
# Newton's method looks for other critical points from a grid of this many
# starting points on a side, over a square at least this big.
NEWTON_GRID = 13
NEWTON_HALF_WIDTH = 4.0
NEWTON_STEPS = 100
# How many points of an ellipse (in the plane) or an ellipsoid (in space) are
# sampled to check the largest and smallest values.
CURVE_SAMPLES = 3600
SURFACE_SAMPLES = 20000
# The Solver's picture: a square around the critical points or candidates.
PICTURE_HALF_WIDTH = 2.0
CONTOUR_GRID = 81


def real_solutions(equations, unknowns, what):
    """The real solutions of the equations, as tuples in the order of unknowns,
    sorted. Raises InputError when SymPy can't solve them or there are
    infinitely many."""
    try:
        solutions = sympy.solve(equations, unknowns, dict=True)
    except (NotImplementedError, ValueError, TypeError) as error:
        raise InputError(f"SymPy couldn't solve the equations for the {what} exactly.") from error
    found = set()
    for solution in solutions:
        if any(unknown not in solution for unknown in unknowns):
            raise InputError(
                f"The equations for the {what} have infinitely many solutions (a whole curve of "
                "them), so they can't be listed one by one."
            )
        values = tuple(sympy.simplify(solution[unknown]) for unknown in unknowns)
        if any(value.free_symbols for value in values):
            raise InputError(
                f"The equations for the {what} have infinitely many solutions, so they can't be "
                "listed one by one."
            )
        if all(is_real(value) for value in values):
            found.add(values)
    return sorted(found, key=lambda values: [float(sympy.N(value)) for value in values])


def is_real(value):
    if value.is_real is not None:
        return value.is_real
    approximate = complex(sympy.N(value, 20))
    return abs(approximate.imag) <= 1e-15 * max(1, abs(approximate.real))


def point_latex(point):
    """A point in exact form, like (1/2, -1): answers here are exact, so 1/2
    isn't shown as the decimal 0.5."""
    return rf"\\left({', '.join(to_latex(value) for value in point)}\\right)"


def same_points(first, second):
    return sorted(first, key=str) == sorted(second, key=str)


# Critical points and the second-derivative test


def substitution_steps(equations, names, solutions):
    """How the system ∇f = 0 is solved by hand, when it can be: solve one
    equation for one variable, put that into the other equation, and solve it.
    Returns substeps, or [] when this route doesn't give exactly SymPy's
    solutions (it can lose some, for example by dividing by 0)."""
    variables = (X, Y)
    tries = []
    for index, equation in enumerate(equations):
        for variable in variables:
            try:
                solved = sympy.solve(equation, variable)
            except (NotImplementedError, ValueError, TypeError):
                continue
            if len(solved) == 1 and variable not in solved[0].free_symbols:
                # A value with no other variable, like x = 1, reads best first.
                tries.append((len(solved[0].free_symbols), index, variable, solved[0]))
    for _, index, variable, value in sorted(tries, key=lambda item: item[:2]):
        other_variable = Y if variable == X else X
        other_equation = sympy.factor(sympy.expand(equations[1 - index].subs(variable, value)))
        if other_equation == 0:
            continue
        try:
            others = [root for root in sympy.solve(other_equation, other_variable) if is_real(root)]
        except (NotImplementedError, ValueError, TypeError):
            continue
        points = []
        for other in others:
            first = sympy.simplify(value.subs(other_variable, other))
            points.append((first, other) if variable == X else (other, first))
        if not same_points(points, solutions):
            continue
        name, other_name = to_latex(variable), to_latex(other_variable)
        substituted = (
            rf"{to_latex(other_equation)} = 0" if other_equation.free_symbols else None
        )
        steps = [
            make_step(
                f"Solve for {name}",
                rf"Solve \${names[index]} = 0$ for \${name}$.",
                [rf"{to_latex(equations[index])} = 0 \\quad\\Longrightarrow\\quad {name} = {to_latex(value)}"],
            )
        ]
        if substituted is not None:
            roots = r" \\text{ or } ".join(
                rf"{other_name} = {to_latex(root)}"
                for root in sorted(set(others), key=lambda root: float(sympy.N(root)))
            )
            steps.append(
                make_step(
                    "Substitute",
                    rf"Put \${name} = {to_latex(value)}$ into \${names[1 - index]} = 0$, factor, and keep "
                    r"the real solutions.",
                    [rf"{substituted} \\quad\\Longrightarrow\\quad {roots}"],
                )
            )
        return steps
    return []


def second_derivative(first, variable, first_name, name):
    d = Differentiation(variable, partial=True)
    derivative, steps, _ = derivative_with_steps(first, d, (X, Y))
    derivative = sympy.simplify(derivative)
    step = make_step(
        f"Partial derivative in {d.name}",
        rf"Differentiate \${first_name}$ with respect to \${d.name}$.",
        [d.of(first), to_latex(derivative)],
        steps,
    )
    return derivative, step, name


CLASSIFICATIONS = {
    "minimum": ("Local minimum", r"$D > 0$ and $f_{xx} > 0$: the surface curves up in every direction, so $f$ has a local minimum here."),
    "maximum": ("Local maximum", r"$D > 0$ and $f_{xx} < 0$: the surface curves down in every direction, so $f$ has a local maximum here."),
    "saddle": ("Saddle point", r"$D < 0$: the surface curves up in some directions and down in others, so this is a saddle point, neither a maximum nor a minimum."),
    "unknown": ("No conclusion", r"$D = 0$, so the second-derivative test gives no conclusion here; $f$ could have a maximum, a minimum, or a saddle point."),
}


def classify(d_value, fxx_value):
    if d_value > 0:
        return "minimum" if fxx_value > 0 else "maximum"
    if d_value < 0:
        return "saddle"
    return "unknown"


def solve_critical(function):
    """The critical points of f(x, y), classified. Returns the steps and, for
    each point, its classification and f's value there."""
    report("Finding the critical points…")
    gradient_step, gradient = gradient_steps(function, (X, Y))
    fx, fy = (sympy.simplify(partial) for partial in gradient)
    points = real_solutions([fx, fy], [X, Y], "critical points")
    substeps = substitution_steps([fx, fy], ("f_x", "f_y"), points)
    listed = r", \\ ".join(point_latex(point) for point in points) if points else r"\\text{none}"
    steps = [
        gradient_step,
        make_step(
            "Critical points",
            r"At a local maximum or minimum the tangent plane is horizontal, so both partial "
            r"derivatives are $0$. Solve $f_x = 0$ and $f_y = 0$ together.",
            [
                separate(
                    rf"{to_latex(fx)} = 0",
                    rf"{to_latex(fy)} = 0",
                    rf"\\text{{critical points: }} {listed}",
                )
            ],
            substeps,
        ),
    ]
    if not points:
        return {"steps": steps, "points": [], "fx": fx, "fy": fy}

    report("Applying the second-derivative test…")
    fxx, fxx_step, _ = second_derivative(fx, X, "f_x", "f_{xx}")
    fyy, fyy_step, _ = second_derivative(fy, Y, "f_y", "f_{yy}")
    fxy, fxy_step, _ = second_derivative(fx, Y, "f_x", "f_{xy}")
    discriminant = sympy.simplify(fxx * fyy - fxy**2)
    steps.append(
        make_step(
            "Second partial derivatives",
            r"The second-derivative test uses $f_{xx}$, $f_{yy}$, and $f_{xy}$, combined into "
            r"$D = f_{xx} f_{yy} - f_{xy}^2$.",
            [
                separate(
                    rf"f_{{xx}} = {to_latex(fxx)}, \\quad f_{{yy}} = {to_latex(fyy)}, \\quad f_{{xy}} = {to_latex(fxy)}",
                    rf"D(x, y) = \\left({to_latex(fxx)}\\right)\\left({to_latex(fyy)}\\right) - "
                    rf"\\left({to_latex(fxy)}\\right)^2 = {to_latex(discriminant)}",
                )
            ],
            [fxx_step, fyy_step, fxy_step],
        )
    )
    classified = []
    for point in points:
        substitutions = {X: point[0], Y: point[1]}
        d_value = sympy.simplify(discriminant.subs(substitutions))
        fxx_value = sympy.simplify(fxx.subs(substitutions))
        value = sympy.simplify(function.subs(substitutions))
        kind = classify(d_value, fxx_value)
        at = point_latex(point)
        steps.append(
            make_step(
                f"Second-derivative test at {at}",
                CLASSIFICATIONS[kind][1],
                [
                    separate(
                        rf"D{at} = {latex_value(d_value)}, \\quad f_{{xx}}{at} = {latex_value(fxx_value)}",
                        rf"f{at} = {latex_value(value)}",
                    )
                ],
            )
        )
        classified.append({"point": point, "kind": kind, "value": value, "d": d_value})
    return {"steps": steps, "points": classified, "fx": fx, "fy": fy}


def numerical_gradient(function, variables, point):
    """∇f at the point by numerical differentiation of the typed function."""
    as_numeric = numeric_function(function, variables)
    with mpmath.workdps(CHECK_DIGITS):
        start = [mpmath.mpf(str(sympy.N(value, CHECK_DIGITS))) for value in point]
        components = []
        for index in range(len(variables)):

            def along(s, index=index):
                moved = list(start)
                moved[index] += s
                return as_numeric(*moved)

            try:
                component = mpmath.diff(along, 0)
            except Exception:  # Numerical differentiation fails in many ways; all mean "no value".
                return None
            if isinstance(component, mpmath.mpc):
                return None
            components.append(component)
        return components


def float_function(expression, variables):
    return sympy.lambdify(variables, expression, modules="math")


def newton_roots(fx, fy, half_width):
    """Critical points found by Newton's method from a grid of starting points:
    an independent search, so a critical point SymPy missed is noticed."""
    gradient = [float_function(partial, (X, Y)) for partial in (fx, fy)]
    hessian = [[float_function(sympy.diff(partial, variable), (X, Y)) for variable in (X, Y)] for partial in (fx, fy)]
    roots = []
    for i in range(NEWTON_GRID):
        for j in range(NEWTON_GRID):
            x = -half_width + 2 * half_width * i / (NEWTON_GRID - 1) + 1e-3
            y = -half_width + 2 * half_width * j / (NEWTON_GRID - 1) + 2e-3
            try:
                for _ in range(NEWTON_STEPS):
                    g = [component(x, y) for component in gradient]
                    (a, b), (c, d) = ([entry(x, y) for entry in row] for row in hessian)
                    determinant = a * d - b * c
                    if determinant == 0:
                        break
                    dx = (d * g[0] - b * g[1]) / determinant
                    dy = (a * g[1] - c * g[0]) / determinant
                    x, y = x - dx, y - dy
                    if abs(dx) + abs(dy) < 1e-13 * (1 + abs(x) + abs(y)):
                        break
                g = [component(x, y) for component in gradient]
            except (ValueError, ZeroDivisionError, OverflowError, TypeError):
                continue
            if not (isinstance(x, float) and isinstance(y, float)):
                continue
            if abs(x) <= half_width and abs(y) <= half_width and math.hypot(*g) < 1e-9:
                roots.append((x, y))
    return roots


def critical_points_check(function, solved):
    points = [item["point"] for item in solved["points"]]
    for point in points:
        numeric = numerical_gradient(function, (X, Y), point)
        if numeric is None:
            return {"status": "unchecked", "detail": "The critical points couldn't be checked numerically."}
        if max(abs(component) for component in numeric) > mpmath.mpf("1e-10"):
            return {
                "status": "failed",
                "detail": f"Numerical differentiation gives $\\\\nabla f \\\\neq \\\\mathbf{{0}}$ at \${point_latex(point)}$. "
                "Treat this answer with caution.",
            }
    floats = [tuple(float(sympy.N(value)) for value in point) for point in points]
    half_width = max([NEWTON_HALF_WIDTH] + [1.5 * max(abs(value) for value in point) for point in floats])
    report("Searching for other critical points…")
    for root in newton_roots(solved["fx"], solved["fy"], half_width):
        if all(math.hypot(root[0] - x, root[1] - y) > 1e-4 * (1 + math.hypot(x, y)) for x, y in floats):
            return {
                "status": "failed",
                "detail": f"Newton's method finds another critical point, near "
                f"$({root[0]:.4f}, {root[1]:.4f})$, which isn't in the list. Treat this answer with caution.",
            }
    side = f"{half_width:g}"
    found = "gives $\\\\nabla f = \\\\mathbf{0}$ at each point, and " if points else ""
    return {
        "status": "verified",
        "detail": f"Numerical differentiation {found}Newton's method, started from "
        f"{NEWTON_GRID * NEWTON_GRID} points across the square $[-{side}, {side}] \\\\times [-{side}, {side}]$, "
        + ("finds no other critical points there." if points else "finds no critical points there."),
    }


def neighbors_check(function, solved):
    """Compares f at each critical point with f on a small circle around it: all
    higher at a local minimum, all lower at a local maximum, both at a saddle."""
    as_numeric = numeric_function(function, (X, Y))
    tested = [item for item in solved["points"] if item["kind"] != "unknown"]
    if not tested:
        return None
    with mpmath.workdps(40):
        for item in tested:
            a, b = (mpmath.mpf(str(sympy.N(value, 40))) for value in item["point"])
            try:
                center = as_numeric(a, b)
                differences = [
                    as_numeric(
                        a + NEIGHBOR_RADIUS * mpmath.cos(2 * mpmath.pi * index / NEIGHBOR_COUNT),
                        b + NEIGHBOR_RADIUS * mpmath.sin(2 * mpmath.pi * index / NEIGHBOR_COUNT),
                    )
                    - center
                    for index in range(NEIGHBOR_COUNT)
                ]
            except Exception:  # Evaluation fails in many ways; all mean "unchecked".
                return {"status": "unchecked", "detail": "f couldn't be evaluated near the critical points."}
            if any(isinstance(difference, mpmath.mpc) for difference in differences):
                return {"status": "unchecked", "detail": "f couldn't be evaluated near the critical points."}
            higher = sum(1 for difference in differences if difference > 0)
            lower = sum(1 for difference in differences if difference < 0)
            agrees = {
                "minimum": higher == NEIGHBOR_COUNT,
                "maximum": lower == NEIGHBOR_COUNT,
                "saddle": higher > 0 and lower > 0,
            }[item["kind"]]
            if not agrees:
                return {
                    "status": "failed",
                    "detail": f"Near \${point_latex(item['point'])}$, f doesn't behave like a "
                    f"{CLASSIFICATIONS[item['kind']][0].lower()}. Treat this answer with caution.",
                }
    return {
        "status": "verified",
        "detail": f"At {NEIGHBOR_COUNT} points on a circle of radius $10^{{-4}}$ around each critical point, "
        "f is higher than at the point around each local minimum, lower around each local maximum, "
        "and both higher and lower around each saddle point.",
    }


def picture_window(points, minimum=PICTURE_HALF_WIDTH):
    """A square around the points: its center and half width."""
    floats = [[float(sympy.N(value)) for value in point] for point in points] or [[0.0, 0.0]]
    xs, ys = [point[0] for point in floats], [point[1] for point in floats]
    center = ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2)
    reach = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    return center, max(minimum, round(1.6 * reach + 0.5, 1))


def critical_points(function):
    if function.has(Z):
        raise InputError("Critical points here are for f(x, y). For f(x, y, z), use a constraint g = k.")
    only_variables(function, (X, Y), "f")
    solved = solve_critical(function)
    points = solved["points"]
    results = [
        {
            "label": "Critical points",
            "latex": r", \\ ".join(point_latex(item["point"]) for item in points) if points else r"\\text{none}",
        }
    ]
    for item in points:
        at = point_latex(item["point"])
        name = CLASSIFICATIONS[item["kind"]][0]
        latex = rf"f{at} = {latex_value(item['value'])}" if item["kind"] != "unknown" else rf"D{at} = 0"
        results.append({"label": f"{name} at \${at}$", "latex": latex})
    report("Checking the answer numerically…")
    checks = [{"label": "Critical points", "check": critical_points_check(function, solved)}]
    neighbors = neighbors_check(function, solved)
    if neighbors is not None:
        checks.append({"label": "Second-derivative test", "check": neighbors})
    center, half_width = picture_window([item["point"] for item in points])
    as_numeric = numeric_function(function, (X, Y))
    xs, ys, z = sample_square(as_numeric, center, half_width)
    return {
        "ok": True,
        "operation": "optimize",
        "kind": "critical",
        "functionLatex": rf"f(x, y) = {to_latex(function)}",
        "results": results,
        "checks": checks,
        "steps": solved["steps"],
        "graph": {
            "kind": "critical",
            "surface": {"x": xs, "y": ys, "z": z, "point": [center[0], center[1], None]},
            "points": [
                {
                    "point": [float(sympy.N(value)) for value in (*item["point"], item["value"])],
                    "kind": item["kind"],
                }
                for item in points
            ],
        },
    }


# Lagrange multipliers


def quadratic_shape(constraint, variables):
    """For g of degree 2 whose quadratic part is definite (an ellipse or
    ellipsoid, when g = k has points): (A, b, c) with g = vᵀAv + b·v + c.
    None for any other g."""
    try:
        polynomial = sympy.Poly(constraint, *variables)
    except sympy.PolynomialError:
        return None
    if polynomial.total_degree() != 2 or not all(c.is_Rational for c in polynomial.coeffs()):
        return None
    size = len(variables)
    matrix = sympy.Matrix(size, size, lambda i, j: sympy.diff(constraint, variables[i], variables[j]) / 2)
    if not (matrix.is_positive_definite or (-matrix).is_positive_definite):
        return None
    linear = sympy.Matrix([sympy.diff(constraint, v).subs({w: 0 for w in variables}) for v in variables])
    constant = constraint.subs({v: 0 for v in variables})
    return matrix, linear, constant


def shape_name(matrix):
    size = matrix.shape[0]
    round_shape = matrix == matrix[0, 0] * sympy.eye(size)
    if size == 2:
        return "circle" if round_shape else "ellipse"
    return "sphere" if round_shape else "ellipsoid"


def lagrange_route(equations, variables, constraint, level, points):
    """How the Lagrange system is solved by hand, when one of two usual routes
    gives exactly SymPy's points: solve each equation ∇f = λ∇g for its own
    variable and substitute into the constraint, or (in the plane) eliminate λ
    with f_x g_y - f_y g_x = 0. Returns substeps, or []."""
    names = [to_latex(variable) for variable in variables]
    lambda_name = to_latex(LAMBDA)
    # Route 1: each variable in terms of λ.
    expressions = {}
    for equation, variable in zip(equations, variables):
        try:
            solved = sympy.solve(equation, variable)
        except (NotImplementedError, ValueError, TypeError):
            solved = []
        if len(solved) != 1 or solved[0].free_symbols - {LAMBDA} or LAMBDA not in solved[0].free_symbols:
            expressions = None
            break
        expressions[variable] = solved[0]
    if expressions:
        in_lambda = sympy.factor(sympy.together(constraint.subs(expressions)))
        try:
            lambdas = [value for value in sympy.solve(sympy.Eq(in_lambda, level), LAMBDA) if is_real(value)]
        except (NotImplementedError, ValueError, TypeError):
            lambdas = []
        found = [tuple(sympy.simplify(expressions[v].subs(LAMBDA, value)) for v in variables) for value in lambdas]
        if lambdas and same_points(found, points):
            lambdas = sorted(set(lambdas), key=lambda value: float(sympy.N(value)))
            equation = rf"{to_latex(in_lambda)} = {to_latex(level)}"
            solved_text = r" \\text{ or } ".join(rf"{lambda_name} = {to_latex(value)}" for value in lambdas)
            return [
                make_step(
                    "Solve for each variable",
                    rf"Solve each equation for its own variable, in terms of \${lambda_name}$.",
                    [r", \\quad ".join(rf"{name} = {to_latex(expressions[v])}" for name, v in zip(names, variables))],
                ),
                make_step(
                    "Substitute into the constraint",
                    rf"Put these into the constraint, which leaves one equation in \${lambda_name}$.",
                    # Already solved, like λ = 2, when the equation is that simple.
                    [equation if equation == solved_text else rf"{equation} \\quad\\Longrightarrow\\quad {solved_text}"],
                ),
            ]
    # Route 2, in the plane: ∇f and ∇g are parallel when f_x g_y - f_y g_x = 0.
    if len(variables) == 2:
        (fx, gx), (fy, gy) = equations_parts(equations, variables)
        parallel = sympy.factor(sympy.expand(fx * gy - fy * gx))
        if parallel == 0:
            return []
        _, factors = sympy.factor_list(parallel)
        cases, found = [], []
        for factor, _ in factors:
            if not factor.free_symbols:
                continue
            try:
                solutions = real_solutions([factor, constraint - level], list(variables), "Lagrange equations")
            except InputError:
                return []
            found += solutions
            listed = r", \\ ".join(point_latex(point) for point in solutions) if solutions else r"\\text{no real points}"
            cases.append(
                rf"{to_latex(factor)} = 0 \\text{{ and }} {to_latex(constraint)} = {to_latex(level)} "
                rf"\\quad\\Longrightarrow\\quad {listed}"
            )
        if same_points(list(set(found)), points):
            return [
                make_step(
                    "Eliminate λ",
                    r"$\\nabla f = \\lambda \\nabla g$ says the gradients are parallel, which in the plane "
                    r"means $f_x g_y - f_y g_x = 0$. Factor it.",
                    [rf"f_x g_y - f_y g_x = {to_latex(parallel)} = 0"],
                ),
                make_step(
                    "Solve with the constraint",
                    r"Each factor that can be $0$ gives a case; solve it together with the constraint.",
                    [separate(*cases)],
                ),
            ]
    return []


def equations_parts(equations, variables):
    """(f_v, g_v) for each variable, read back from f_v - λ g_v."""
    parts = []
    for equation in equations:
        expanded = sympy.expand(equation)
        g_part = -expanded.coeff(LAMBDA)
        parts.append((sympy.expand(expanded + LAMBDA * g_part), g_part))
    return parts


def solve_lagrange(function, constraint, level, variables):
    """The extreme values of f on g = k. Returns the steps, the candidates with
    f's values, and, when g = k is an ellipse or ellipsoid, the maximum and
    minimum."""
    names = [to_latex(variable) for variable in variables]
    report("Finding the gradients…")
    f_step, f_gradient = gradient_steps(function, variables)
    g_step, g_gradient = gradient_steps(constraint, variables, "g")
    equations = [sympy.expand(fv - LAMBDA * gv) for fv, gv in zip(f_gradient, g_gradient)]
    lambda_name = to_latex(LAMBDA)
    system = [
        rf"{to_latex(fv)} = {lambda_name}\\left({to_latex(gv)}\\right)" if gv.is_Add else rf"{to_latex(fv)} = {to_latex(LAMBDA * gv)}"
        for fv, gv in zip(f_gradient, g_gradient)
    ]
    system.append(rf"{to_latex(constraint)} = {to_latex(level)}")
    report("Solving the Lagrange equations…")
    solutions = real_solutions(equations + [constraint - level], [*variables, LAMBDA], "Lagrange equations")
    by_point = {}
    for *point, multiplier in solutions:
        by_point.setdefault(tuple(point), multiplier)
    points = sorted(by_point, key=lambda point: [float(sympy.N(value)) for value in point])
    # Lagrange's condition needs ∇g ≠ 0; points of g = k where ∇g = 0 are
    # candidates too.
    singular = [
        tuple(point)
        for point in real_solutions(list(g_gradient) + [constraint - level], list(variables), "points where ∇g = 0")
        if tuple(point) not in by_point
    ]
    route = lagrange_route(equations, variables, constraint, level, points)
    listed = (
        r" \\\\ ".join(
            rf"{point_latex(point)}, \\quad {lambda_name} = {latex_value(by_point[point])}" for point in points
        )
        if points
        else r"\\text{no real solutions}"
    )
    steps = [
        f_step,
        g_step,
        make_step(
            "Lagrange equations",
            rf"At a largest or smallest value of $f$ on the constraint, $\\nabla f$ is parallel to "
            rf"$\\nabla g$: $\\nabla f = {lambda_name} \\nabla g$ for some number \${lambda_name}$, the "
            r"Lagrange multiplier. Together with the constraint, that is one equation per unknown.",
            [separate(*system)],
        ),
        make_step(
            "Solve the system",
            r"Solve the equations together; only $(x, y)$"
            + (r" or $(x, y, z)$" if len(variables) == 3 else "")
            + r" matters for the answer.",
            [r"\\begin{gathered}" + listed + r"\\end{gathered}"],
            route,
        ),
    ]
    if singular:
        steps.append(
            make_step(
                "Points where ∇g = 0",
                r"The method needs $\\nabla g \\neq \\mathbf{0}$, so points of the constraint where "
                r"$\\nabla g = \\mathbf{0}$ are candidates too.",
                [r", \\ ".join(point_latex(point) for point in singular)],
            )
        )
    candidates = points + singular
    values = {point: sympy.simplify(function.subs(dict(zip(variables, point)))) for point in candidates}
    if candidates:
        steps.append(
            make_step(
                "Values at the candidates",
                r"Evaluate $f$ at each point found.",
                [separate(*(rf"f{point_latex(point)} = {latex_value(values[point])}" for point in candidates))],
            )
        )
    shape = quadratic_shape(sympy.expand(constraint), variables)
    solved = {
        "steps": steps,
        "candidates": candidates,
        "values": values,
        "multipliers": by_point,
        "shape": shape,
        "maximum": None,
        "minimum": None,
    }
    if not candidates:
        return solved
    numbers = {point: float(sympy.N(values[point])) for point in candidates}
    largest = max(numbers.values())
    smallest = min(numbers.values())
    tolerance = 1e-12 * max(1, abs(largest), abs(smallest))
    top = [point for point in candidates if numbers[point] >= largest - tolerance]
    bottom = [point for point in candidates if numbers[point] <= smallest + tolerance]
    if shape is not None:
        kind = shape_name(shape[0])
        solved.update(maximum=(values[top[0]], top), minimum=(values[bottom[0]], bottom), kind=kind)
        steps.append(
            make_step(
                "Largest and smallest values",
                rf"The constraint is {'an' if kind[0] in 'ae' else 'a'} {kind}: closed and bounded, so "
                r"$f$ has a largest and a smallest value on it, and both are among the candidates.",
                [
                    separate(
                        rf"\\text{{maximum: }} {extreme_latex(top, values[top[0]])}",
                        rf"\\text{{minimum: }} {extreme_latex(bottom, values[bottom[0]])}",
                    )
                ],
            )
        )
    elif len(candidates) == 1:
        steps.append(
            make_step(
                "The only candidate",
                r"The constraint isn't known to be closed and bounded (like a circle or a sphere), so "
                r"$f$ may have no largest or no smallest value on it. If it has one, it is at this "
                r"point; a picture or another argument shows which.",
                [extreme_latex(top, values[top[0]])],
            )
        )
    else:
        steps.append(
            make_step(
                "Largest and smallest candidates",
                r"The constraint isn't known to be closed and bounded (like a circle or a sphere), so "
                r"$f$ may have no largest or no smallest value on it. If it has one, it is among the "
                r"candidates; a picture or another argument shows which.",
                [
                    separate(
                        rf"\\text{{largest candidate: }} {extreme_latex(top, values[top[0]])}",
                        rf"\\text{{smallest candidate: }} {extreme_latex(bottom, values[bottom[0]])}",
                    )
                ],
            )
        )
    return solved


def extreme_latex(points, value):
    return " = ".join(rf"f{point_latex(point)}" for point in points) + rf" = {latex_value(value)}"


def lagrange_points_check(function, constraint, level, variables, candidates):
    """At each candidate: g = k to 30 digits, and ∇f, ∇g (by numerical
    differentiation) parallel."""
    as_numeric = numeric_function(constraint, variables)
    with mpmath.workdps(CHECK_DIGITS):
        for point in candidates:
            at = [mpmath.mpf(str(sympy.N(value, CHECK_DIGITS))) for value in point]
            try:
                g_value = as_numeric(*at)
            except Exception:  # Evaluation fails in many ways; all mean "unchecked".
                g_value = None
            f_gradient = numerical_gradient(function, variables, point)
            g_gradient = numerical_gradient(constraint, variables, point)
            if g_value is None or isinstance(g_value, mpmath.mpc) or f_gradient is None or g_gradient is None:
                return {"status": "unchecked", "detail": "The candidates couldn't be checked numerically."}
            target = mpmath.mpf(str(sympy.N(level, CHECK_DIGITS)))
            on_constraint = abs(g_value - target) <= CHECK_TOLERANCE * max(1, abs(target))
            if len(variables) == 2:
                crosses = [f_gradient[0] * g_gradient[1] - f_gradient[1] * g_gradient[0]]
            else:
                f1, f2, f3 = f_gradient
                g1, g2, g3 = g_gradient
                crosses = [f2 * g3 - f3 * g2, f3 * g1 - f1 * g3, f1 * g2 - f2 * g1]
            scale = max(1, mpmath.norm(f_gradient) * mpmath.norm(g_gradient))
            parallel = all(abs(cross) <= mpmath.mpf("1e-10") * scale for cross in crosses)
            if not (on_constraint and parallel):
                return {
                    "status": "failed",
                    "detail": f"At \${point_latex(point)}$ the numbers don't agree: "
                    + ("the point isn't on the constraint." if not on_constraint else "∇f isn't parallel to ∇g.")
                    + " Treat this answer with caution.",
                }
    return {
        "status": "verified",
        "detail": "At each candidate, g equals the constraint's value to 30 digits, and numerical "
        "differentiation gives ∇f parallel to ∇g (or ∇g = 0).",
    }


def fibonacci_directions(count):
    """count directions spread evenly over the sphere."""
    golden = math.pi * (3 - math.sqrt(5))
    for index in range(count):
        z = 1 - 2 * (index + 0.5) / count
        radius = math.sqrt(1 - z * z)
        yield (radius * math.cos(golden * index), radius * math.sin(golden * index), z)


def extremes_check(function, variables, level, solved):
    """Samples the ellipse or ellipsoid g = k and compares f there with the
    maximum and minimum: an independent check that no candidate was missed."""
    matrix, linear, constant = solved["shape"]
    center = -matrix.inv() * linear / 2
    center_value = (center.T * matrix * center)[0] + linear.dot(center) + constant
    a = [[float(entry) for entry in row] for row in matrix.tolist()]
    c = [float(value) for value in center]
    room = float(level - center_value)
    as_float = float_function(function, variables)
    if len(variables) == 2:
        directions = [
            (math.cos(2 * math.pi * index / CURVE_SAMPLES), math.sin(2 * math.pi * index / CURVE_SAMPLES))
            for index in range(CURVE_SAMPLES)
        ]
    else:
        directions = list(fibonacci_directions(SURFACE_SAMPLES))
    samples = []
    for u in directions:
        curvature = sum(a[i][j] * u[i] * u[j] for i in range(len(u)) for j in range(len(u)))
        reach = math.sqrt(room / curvature)
        try:
            samples.append(as_float(*(c[i] + reach * u[i] for i in range(len(u)))))
        except (ValueError, ZeroDivisionError, OverflowError):
            return {"status": "unchecked", "detail": "f couldn't be evaluated on the constraint."}
    maximum = float(sympy.N(solved["maximum"][0]))
    minimum = float(sympy.N(solved["minimum"][0]))
    spread = max(1.0, maximum - minimum)
    above = max(samples) - maximum
    below = minimum - min(samples)
    where = "curve" if len(variables) == 2 else "surface"
    if above > 1e-9 * spread or below > 1e-9 * spread:
        return {
            "status": "failed",
            "detail": f"A point of the constraint {where} gives f = {max(samples) if above > 0 else min(samples):.6g}, "
            "beyond the maximum or minimum found. Treat this answer with caution.",
        }
    gap = max(0.0, -above, -below)
    if gap > 1e-3 * spread:
        return {
            "status": "failed",
            "detail": "Points sampled over the constraint don't come close to the maximum or minimum found. "
            "Treat this answer with caution.",
        }
    return {
        "status": "verified",
        "detail": f"f was evaluated at {len(samples):,} points spread over the {solved['kind']}: none is above "
        "the maximum or below the minimum, and the closest "
        + (f"come within {gap:.2g} of them." if gap > 1e-9 * spread else "match them."),
    }


def lagrange(function, constraint, level_text):
    if constraint is None:
        raise InputError("Enter the constraint function g.")
    variables = (X, Y, Z) if function.has(Z) or constraint.has(Z) else (X, Y)
    only_variables(function, variables, "f")
    only_variables(constraint, variables, "g")
    if not constraint.free_symbols:
        raise InputError("The constraint g must use the variables; a constant g gives no curve or surface.")
    level = number(level_text, "constraint's value k")
    solved = solve_lagrange(function, constraint, level, variables)
    names = ", ".join(to_latex(variable) for variable in variables)
    shape = solved["shape"]
    if shape is not None:
        matrix, linear, constant = shape
        center = -matrix.inv() * linear / 2
        center_value = sympy.simplify((center.T * matrix * center)[0] + linear.dot(center) + constant)
        if sympy.simplify((level - center_value) / matrix[0, 0]) < 0:
            raise InputError(f"$g({names}) = {to_latex(level)}$ has no real points, so there is nothing to optimize.")
    candidates, values = solved["candidates"], solved["values"]
    results = [
        {
            "label": "Candidates",
            "latex": r", \\ ".join(rf"f{point_latex(point)} = {latex_value(values[point])}" for point in candidates)
            if candidates
            else r"\\text{none}",
        }
    ]
    if solved["maximum"] is not None:
        results += [
            {"label": "Maximum value", "latex": extreme_latex(solved["maximum"][1], solved["maximum"][0])},
            {"label": "Minimum value", "latex": extreme_latex(solved["minimum"][1], solved["minimum"][0])},
        ]
    report("Checking the answer numerically…")
    checks = []
    if candidates:
        checks.append(
            {
                "label": "Candidates",
                "check": lagrange_points_check(function, constraint, level, variables, candidates),
            }
        )
    if solved["maximum"] is not None:
        checks.append({"label": "Maximum and minimum", "check": extremes_check(function, variables, level, solved)})
    return {
        "ok": True,
        "operation": "optimize",
        "kind": "lagrange",
        "functionLatex": rf"f({names}) = {to_latex(function)}, \\text{{ subject to }} {to_latex(constraint)} = {to_latex(level)}",
        "results": results,
        "checks": checks,
        "steps": solved["steps"],
        "graph": lagrange_graph(function, constraint, level, candidates, values, solved) if len(variables) == 2 else None,
    }


def contour_grid(function, center, half_width):
    """f on a square grid, as rows (one per y), for drawing level curves."""
    as_float = float_function(function, (X, Y))
    xs = [round(center[0] - half_width + 2 * half_width * i / (CONTOUR_GRID - 1), 6) for i in range(CONTOUR_GRID)]
    ys = [round(center[1] - half_width + 2 * half_width * j / (CONTOUR_GRID - 1), 6) for j in range(CONTOUR_GRID)]
    rows = []
    for y in ys:
        row = []
        for x in xs:
            try:
                value = as_float(x, y)
                row.append(round(value, 6) if isinstance(value, float) and math.isfinite(value) else None)
            except (ValueError, ZeroDivisionError, OverflowError, TypeError):
                row.append(None)
        rows.append(row)
    return xs, ys, rows


def lagrange_graph(function, constraint, level, candidates, values, solved):
    """The Solver's picture for f(x, y) on g = k: f and g on a grid (the page
    draws level curves from them), and the candidates."""
    center, half_width = picture_window(candidates, 2.0)
    xs, ys, f_rows = contour_grid(function, center, half_width)
    _, _, g_rows = contour_grid(constraint, center, half_width)
    maximum = solved["maximum"][1] if solved["maximum"] else []
    minimum = solved["minimum"][1] if solved["minimum"] else []
    return {
        "kind": "lagrange",
        "x": xs,
        "y": ys,
        "f": f_rows,
        "g": g_rows,
        "level": float(sympy.N(level)),
        "candidates": [
            {
                "point": [float(sympy.N(value)) for value in point],
                "value": float(sympy.N(values[point])),
                "kind": "maximum" if point in maximum else "minimum" if point in minimum else "candidate",
            }
            for point in candidates
        ],
    }


def optimize(function, kind, constraint=None, level_text=None):
    if kind == "critical":
        return critical_points(function)
    if kind == "lagrange":
        return lagrange(function, constraint, level_text)
    raise InputError("Choose critical points of f(x, y), or extreme values on a constraint g = k.")


# The lesson picture


def constraint_picture(function, constraint, x_of_t, y_of_t, interval, divisions):
    """The lesson picture: f(x, y) on a fixed square (the page draws level
    curves from it), the constraint curve, and at each slider position the
    point, f, ∇f, and ∇g there."""
    t = T
    lower, upper = interval
    xs, ys, rows = contour_grid(function, (0, 0), 2.5)
    position = sympy.lambdify(t, (x_of_t, y_of_t), modules="math")
    f_float = float_function(function, (X, Y))
    gradients = [
        [float_function(sympy.diff(expression, variable), (X, Y)) for variable in (X, Y)]
        for expression in (function, constraint)
    ]
    low, high = float(sympy.N(lower)), float(sympy.N(upper))
    curve_points = [position(low + (high - low) * index / 240) for index in range(241)]
    positions = []
    for index in range(divisions + 1):
        # Exact parameter values, so 45° lands exactly on (1, 1).
        value = lower + (upper - lower) * sympy.Rational(index, divisions)
        x = float(sympy.N(x_of_t.subs(t, value)))
        y = float(sympy.N(y_of_t.subs(t, value)))
        positions.append(
            {
                "point": [round(x, 6), round(y, 6)],
                "value": round(f_float(x, y), 6),
                "gradF": [round(partial(x, y), 6) for partial in gradients[0]],
                "gradG": [round(partial(x, y), 6) for partial in gradients[1]],
            }
        )
    return {
        "ok": True,
        "operation": "constraintPicture",
        "x": xs,
        "y": ys,
        "f": rows,
        "curve": {"x": [round(p[0], 6) for p in curve_points], "y": [round(p[1], 6) for p in curve_points]},
        "positions": positions,
    }
`,"./python/mathlab/parsing.py":`"""Reading the student's input: translate textbook notation, then parse safely.

Students write math many ways: x², √x, |x|, π, 2·x, log_2(x), sin⁻¹... All of
it is translated to plain text first. Only then is the text checked against a
short list of safe characters, because SymPy's parse_expr runs its input as
Python. Letters other than the variables are constants, like a, b, c in
a x^2 + b x + c.
"""

import math
import re
import string

import sympy
from sympy.parsing.sympy_parser import (
    _token_splittable,
    convert_xor,
    function_exponentiation,
    implicit_application,
    implicit_multiplication,
    parse_expr,
    split_symbols_custom,
    standard_transformations,
)

from mathlab.expressions import X, InputError

MAX_INPUT_LENGTH = 200
# Exact numbers with more digits than this are refused; SymPy would take
# minutes or hours to build them.
MAX_EXACT_DIGITS = 100_000

# After translation, only these characters may remain. Without quotes,
# brackets, underscores, or = signs, input cannot reach anything in Python
# except SymPy's math functions.
ALLOWED_CHARACTERS = re.compile(r"[A-Za-z0-9\\s+\\-*/^().,!]*")

GREEK_LETTERS = {
    "α": "alpha",
    "θ": "theta",
    "φ": "phi",
    "ϕ": "phi",
    "ω": "omega",
    "λ": "lamda",  # SymPy's spelling, since lambda is a Python keyword.
    "μ": "mu",
    "σ": "sigma",
    "τ": "tau",
    "ρ": "rho",
    "δ": "delta",
    "ε": "epsilon",
    "ψ": "psi",
    "ξ": "xi",
    "η": "eta",
    "κ": "kappa",
    "ν": "nu",
}

# Symbols to plain text. Spaces keep names apart: 2π becomes 2 pi.
SYMBOL_TRANSLATIONS = {
    "π": " pi ",
    "∞": " oo ",
    "√": " sqrt ",
    "∛": " cbrt ",
    "Γ": " gamma ",
    "·": "*",
    "⋅": "*",
    "×": "*",
    "∗": "*",
    "÷": "/",
    "∕": "/",
    "−": "-",
    "–": "-",
    "—": "-",
    "[": "(",
    "]": ")",
    "{": "(",
    "}": ")",
    **{letter: f" {name} " for letter, name in GREEK_LETTERS.items()},
}

SUPERSCRIPTS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺", "0123456789-+")
SUPERSCRIPT_RUN = re.compile("[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+")


def log_base(base):
    return lambda argument: sympy.log(argument, base)


# Names students use that SymPy spells differently. Everything else, such as
# sec, sinh, sqrt, cbrt, exp, floor, erf, and gamma, comes from SymPy itself.
FUNCTION_ALIASES = {
    "ln": sympy.log,
    "log10": log_base(10),
    "log2": log_base(2),
    "arcsin": sympy.asin,
    "arccos": sympy.acos,
    "arctan": sympy.atan,
    "arcsec": sympy.asec,
    "arccsc": sympy.acsc,
    "arccot": sympy.acot,
    "arcsinh": sympy.asinh,
    "arccosh": sympy.acosh,
    "arctanh": sympy.atanh,
    "abs": sympy.Abs,
    "sgn": sympy.sign,
    "ceil": sympy.ceiling,
}

# Every function name a student might type, for spotting typos like sinx.
FUNCTION_NAMES = sorted(
    {
        *FUNCTION_ALIASES,
        *"sin cos tan sec csc cot sinh cosh tanh sech csch coth".split(),
        *"asin acos atan asec acsc acot asinh acosh atanh log exp sqrt cbrt".split(),
        *"floor ceiling sign erf gamma factorial".split(),
    },
    key=len,
    reverse=True,
)

# Letters stand for constants (every letter except e, which is Euler's number).
CONSTANT_NAMES = [letter for letter in string.ascii_letters if letter not in "eE"] + sorted(
    set(GREEK_LETTERS.values())
)

NAMES = {
    "e": sympy.E,
    "E": sympy.E,
    "pi": sympy.pi,
    **FUNCTION_ALIASES,
    **{name: sympy.Symbol(name, real=True) for name in CONSTANT_NAMES},
}


def splittable(name):
    """Whether to split a run of letters like xy into x*y. Runs that start with a
    function name, like sinx, are kept whole so they can be reported as typos."""
    if any(name.startswith(function) for function in FUNCTION_NAMES):
        return False
    return _token_splittable(name)


TRANSFORMATIONS = standard_transformations + (
    split_symbols_custom(splittable),
    implicit_multiplication,
    implicit_application,
    function_exponentiation,
    convert_xor,
)

# Textbook notation like sin^2(x), which means (sin(x))^2.
FUNCTION_POWER = re.compile(r"\\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log)\\^(\\d+)\\s*\\(")
# log_2(x) or log_b(x): a logarithm with a base.
LOG_WITH_BASE = re.compile(r"\\blog_([0-9]+|[A-Za-z])\\s*\\(")


def find_closing_parenthesis(text, open_index):
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def rewrite_function_powers(text):
    """Rewrite sin^2(x) as (sin(x))^2, which SymPy can parse."""
    while match := FUNCTION_POWER.search(text):
        open_index = match.end() - 1
        close_index = find_closing_parenthesis(text, open_index)
        if close_index is None:
            break  # Unbalanced parentheses; the parser reports the error.
        name, power = match.group(1), match.group(2)
        argument = text[open_index : close_index + 1]
        text = f"{text[: match.start()]}({name}{argument})^{power}{text[close_index + 1 :]}"
    return text


def rewrite_log_bases(text):
    """Rewrite log_2(x) as log(x, 2)."""
    while match := LOG_WITH_BASE.search(text):
        open_index = match.end() - 1
        close_index = find_closing_parenthesis(text, open_index)
        if close_index is None:
            break
        argument = text[open_index + 1 : close_index]
        text = f"{text[: match.start()]}log({argument}, {match.group(1)}){text[close_index + 1 :]}"
    return text


def rewrite_absolute_bars(text):
    """Rewrite |x| as abs(x). A bar opens a new absolute value at the start, after
    an operator or another bar; otherwise it closes the innermost one."""
    result = []
    depth = 0
    for index, character in enumerate(text):
        if character != "|":
            result.append(character)
            continue
        previous = text[:index].rstrip()[-1:]
        if depth == 0 or previous in ("", "(", "+", "-", "*", "/", "^", ",", "|"):
            result.append("abs(")
            depth += 1
        else:
            result.append(")")
            depth -= 1
    if depth != 0:
        raise InputError("The absolute value bars | | don't pair up.")
    return "".join(result)


# √ or ∛ directly before one number or letter applies to just that, as in
# √x · sin(x). Before a parenthesis it applies to the whole parenthesis.
ROOT_OF_ONE_SYMBOL = re.compile(r"([√∛])\\s*(\\d+(?:\\.\\d+)?|[A-Za-zπα-ω])")


def translate_notation(text):
    """Turn textbook notation into text the parser reads."""
    text = ROOT_OF_ONE_SYMBOL.sub(lambda match: f"{match.group(1)}({match.group(2)})", text)
    for symbol, replacement in SYMBOL_TRANSLATIONS.items():
        text = text.replace(symbol, replacement)
    text = SUPERSCRIPT_RUN.sub(lambda run: f"^({run.group().translate(SUPERSCRIPTS)})", text)
    text = rewrite_absolute_bars(text)
    text = rewrite_log_bases(text)
    return rewrite_function_powers(text)


def has_enormous_number(expression):
    """True if computing expression exactly would build a gigantic number, like
    9^9^9^9, which would freeze SymPy. expression must be unevaluated."""
    if any(has_enormous_number(argument) for argument in expression.args):
        return True
    if not isinstance(expression, sympy.Pow) or expression.free_symbols:
        return False
    base, exponent = expression.args
    try:
        # Inner powers were checked above, so these are safe to approximate.
        base_size = abs(float(base.evalf(15)))
        exponent_size = abs(float(exponent.evalf(15)))
    except (TypeError, ValueError):  # Not a real number, such as a complex power.
        return False
    if base_size in (0.0, 1.0):
        return False
    digits = exponent_size * abs(math.log10(base_size))
    return digits > MAX_EXACT_DIGITS


def typo_suggestion(name):
    """For a run of letters like sinx, suggest sin(x)."""
    for function in FUNCTION_NAMES:
        if name.startswith(function) and len(name) > len(function):
            return f" Did you mean {function}({name[len(function):]})?"
    return " Use one letter per constant, or put * between letters."


def parse_function(text, variables=(X,)):
    """Parse the student's function. Letters other than the variables are constants."""
    description, example = {
        2: ("x and y", "x^2 y + sin(x y)"),
        3: ("x, y, and z", "x y z^2"),
    }.get(len(variables), ("x", "x^2 sin(x)"))
    text = text.strip()
    if not text:
        raise InputError(f"Type a function of {description}, such as {example}.")
    if len(text) > MAX_INPUT_LENGTH:
        raise InputError(f"That expression is too long (the limit is {MAX_INPUT_LENGTH} characters).")
    text = translate_notation(text)
    unknown_characters = sorted({character for character in text if not ALLOWED_CHARACTERS.fullmatch(character)})
    if unknown_characters:
        raise InputError(f"These characters can't be used here: {' '.join(unknown_characters)}")
    local_names = {**NAMES, **{variable.name: variable for variable in variables}}
    try:
        # Read it first without computing anything, to catch enormous numbers.
        unevaluated = parse_expr(text, local_dict=local_names, transformations=TRANSFORMATIONS, evaluate=False)
        if has_enormous_number(unevaluated):
            raise InputError("That contains a number too large to compute exactly, such as 9^9^9.")
        function = parse_expr(text, local_dict=local_names, transformations=TRANSFORMATIONS)
    except InputError:
        raise
    except Exception as error:  # The parser raises many error types for bad syntax.
        raise InputError("Couldn't read that expression. Check the parentheses and operators.") from error
    if not isinstance(function, sympy.Expr):
        raise InputError(f"That isn't a function. Try something like {example}.")
    for symbol in function.free_symbols:
        if symbol.name not in local_names:
            raise InputError(f"I don't know \\"{symbol.name}\\".{typo_suggestion(symbol.name)}")
    if function.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        raise InputError("That expression is undefined, for example because it divides by zero.")
    return function


def constants_in(function, variables):
    """The letters in function other than its variables, sorted by name."""
    return sorted(function.free_symbols - set(variables), key=lambda symbol: symbol.name)
`,"./python/mathlab/practice.py":`"""Practice problems for the lessons, and checking a student's answer.\r
\r
A problem is built from its lesson and a seed. Checking rebuilds the same\r
problem from the seed, so the expected answer never has to leave Python.\r
"""\r
\r
import random\r
\r
import sympy\r
\r
from mathlab.checks import agree_numerically\r
from mathlab.curves import arc_length, area, build_curve, slope_steps\r
from mathlab.derivative_steps import Differentiation, derivative_with_steps\r
from mathlab.directional import solve_directional\r
from mathlab.double import iterated_integral\r
from mathlab.expressions import PHI, THETA, R, T, X, Y, Z, InputError, to_latex\r
from mathlab.green import make_region, solve_green\r
from mathlab.latex_input import latex_to_text\r
from mathlab.line_integrals import solve_line_integral\r
from mathlab.optimize import solve_critical, solve_lagrange\r
from mathlab.parsing import parse_function\r
from mathlab.space_curves import build_space_curve, curvature_steps, velocity_steps\r
from mathlab.tangent import solve_graph\r
from mathlab.triple import COORDINATE_SYSTEMS, ORDERS, change_coordinates, iterated_triple_integral\r
from mathlab.vectors import angle_result, dot_product_step, length, length_step, projection_results, vector_latex\r
\r
# Answers within this relative distance count as correct, so a decimal with\r
# four significant digits is accepted for an answer like arccos(1/3).\r
DECIMAL_TOLERANCE = 5e-4\r
\r
\r
class Problem:\r
    def __init__(self, prompt, expected, variables, steps):\r
        self.prompt = prompt  # Text with inline LaTeX between $ signs.\r
        self.expected = expected  # The exact answer, as a SymPy expression.\r
        self.variables = variables  # Variables the answer may contain.\r
        self.steps = steps  # How to get the answer.\r
\r
\r
def nonzero_vector(rng):\r
    while True:\r
        vector = sympy.Matrix([rng.randint(-5, 5) for _ in range(3)])\r
        if vector != sympy.zeros(3, 1):\r
            return vector\r
\r
\r
def vector_problem(rng):\r
    a, b = nonzero_vector(rng), nonzero_vector(rng)\r
    dot = a.dot(b)\r
    vectors = rf"$\\mathbf{{a}} = {vector_latex(a)}$ and $\\mathbf{{b}} = {vector_latex(b)}$"\r
    kind = rng.choice(["dot", "length", "angle", "component"])\r
    if kind == "dot":\r
        return Problem(\r
            rf"Find $\\mathbf{{a}} \\cdot \\mathbf{{b}}$ for {vectors}.", dot, (), [dot_product_step(a, b)]\r
        )\r
    if kind == "length":\r
        return Problem(rf"Find $|\\mathbf{{a}}|$ for {vectors}.", length(a), (), [length_step(a, "a")])\r
    if kind == "angle":\r
        angle, step = angle_result(a, b, dot)\r
        return Problem(\r
            rf"Find the angle $\\theta$ between {vectors}, in radians (exact, or a decimal "\r
            r"with four significant digits).",\r
            angle,\r
            (),\r
            [dot_product_step(a, b), step],\r
        )\r
    scalar, _, step = projection_results(a, b, dot)\r
    return Problem(\r
        rf"Find the scalar projection $\\operatorname{{comp}}_{{\\mathbf{{b}}}} \\mathbf{{a}}$ for {vectors}.",\r
        scalar,\r
        (),\r
        [dot_product_step(a, b), length_step(b, "b"), step],\r
    )\r
\r
\r
def partial_derivative_problem(rng):\r
    c = rng.choice([2, 3, 4, 5])\r
    m = rng.choice([2, 3])\r
    n = rng.choice([1, 2, 3])\r
    function = rng.choice(\r
        [\r
            c * X**m * Y**n,\r
            sympy.sin(c * X * Y),\r
            sympy.exp(c * X) * sympy.cos(Y),\r
            sympy.log(X**2 + c * Y**2),\r
            X**m * sympy.exp(c * Y),\r
            (X + c * Y) ** m,\r
            X / (Y + c),\r
            X**m * Y + c * X * Y**n,\r
        ]\r
    )\r
    variable = rng.choice([X, Y])\r
    d = Differentiation(variable, partial=True)\r
    derivative, steps, _ = derivative_with_steps(function, d, (X, Y))\r
    return Problem(\r
        rf"Find $\\frac{{\\partial f}}{{\\partial {variable}}}$ for $f(x, y) = {to_latex(function)}$.",\r
        derivative,\r
        (X, Y),\r
        steps,\r
    )\r
\r
\r
def double_integral_problem(rng):\r
    """An iterated integral over a rectangle, or over a region with a curved or\r
    slanted edge, with an exact answer."""\r
    c = rng.choice([1, 2, 3])\r
    kind = rng.choice(["rectangle", "rectangle", "separable", "region"])\r
    if kind == "rectangle":\r
        function = rng.choice([c * X * Y**2, X**2 + c * Y, c * X**2 * Y, X + c * Y, X * Y + c])\r
        inside, outside = rng.choice([(Y, X), (X, Y)])\r
        low = rng.choice([0, 1])\r
        inner_bounds = (low, low + rng.choice([1, 2]))\r
        outer_bounds = (0, rng.choice([1, 2, 3]))\r
    elif kind == "separable":\r
        function, inside, outside, inner_bounds, outer_bounds = rng.choice(\r
            [\r
                (sympy.sin(X) * sympy.cos(Y), Y, X, (0, sympy.pi / 2), (0, sympy.pi)),\r
                (sympy.exp(X + Y), Y, X, (0, 1), (0, c)),\r
                (X * sympy.exp(Y), X, Y, (0, 2), (0, 1)),\r
            ]\r
        )\r
    else:\r
        inside, outside = rng.choice([(Y, X), (X, Y)])\r
        function = rng.choice([X * Y, X + Y, c * outside, inside**2 + c])\r
        inner_bounds = rng.choice([(0, outside), (outside**2, outside), (0, c * outside)])\r
        outer_bounds = (0, 1) if inner_bounds[0] != 0 else (0, rng.choice([1, 2]))\r
    # Exact SymPy numbers, as the Solver's bounds are.\r
    inner_bounds, outer_bounds = (tuple(map(sympy.sympify, bounds)) for bounds in (inner_bounds, outer_bounds))\r
    iterated, steps, value = iterated_integral(function, inside, outside, inner_bounds, outer_bounds)\r
    return Problem(rf"Evaluate \${iterated}$.", value, (), steps)\r
\r
\r
def triple_integral_problem(rng):\r
    """An iterated triple integral over a box, a tetrahedron, or the solid under\r
    a slanted plane, with an exact answer."""\r
    c = rng.choice([1, 2, 3])\r
    variables = ORDERS[rng.choice(sorted(ORDERS))]\r
    inner, middle, outer = variables\r
    kind = rng.choice(["box", "box", "tetrahedron", "under a plane"])\r
    if kind == "box":\r
        function = rng.choice([c * X * Y * Z, X + Y + Z, X**2 * Z + c * Y, c * X * Y**2, Y * Z + c])\r
        lows = [rng.choice([0, 1]) for _ in variables]\r
        bounds = [(low, low + rng.choice([1, 2])) for low in lows]\r
    elif kind == "tetrahedron":\r
        # The solid with inner + middle + outer ≤ size in the first octant.\r
        size = rng.choice([1, 2])\r
        function = rng.choice([sympy.Integer(1), X, Y, Z, c * X * Y])\r
        bounds = [(0, size - outer - middle), (0, size - outer), (0, size)]\r
    else:\r
        # Below the plane inner = middle + outer, over a rectangle.\r
        function = rng.choice([sympy.Integer(1), c * inner, middle + outer])\r
        bounds = [(0, middle + outer), (0, rng.choice([1, 2])), (0, rng.choice([1, 2]))]\r
    # Exact SymPy numbers, as the Solver's bounds are.\r
    bounds = [tuple(map(sympy.sympify, pair)) for pair in bounds]\r
    iterated, steps, (_, _, value) = iterated_triple_integral(function, variables, bounds)\r
    return Problem(rf"Evaluate \${iterated}$.", value, (), steps)\r
\r
\r
def curve_problem(rng):\r
    """The slope of a parametric curve at a point, the area inside a polar\r
    curve, or an arc length built so that its integral has an exact value."""\r
    c = rng.choice([1, 2, 3])\r
    pi = sympy.pi\r
    kind = rng.choice(["slope", "polar area", "arc length"])\r
    if kind == "slope":\r
        x, y, at = rng.choice(\r
            [\r
                (T**2, T**3 - 3 * T, rng.choice([1, 2, sympy.sqrt(3)])),\r
                (T**2 + c * T, T**3, rng.choice([1, 2])),\r
                (c * sympy.cos(T), c * sympy.sin(T), rng.choice([pi / 6, pi / 4, pi / 3])),\r
                (T - sympy.sin(T), 1 - sympy.cos(T), rng.choice([pi / 2, pi / 3, 2 * pi / 3])),\r
                (sympy.exp(T), sympy.exp(c * T), rng.choice([0, 1])),\r
            ]\r
        )\r
        curve = build_curve("parametric", x, y, None, (at, at), at)\r
        steps, _ = slope_steps(curve)\r
        dx0, dy0 = (derivative.subs(T, at) for derivative in (curve["dxdt"], curve["dydt"]))\r
        # The slope's step and the step at the point; d²y/dx² isn't asked for.\r
        return Problem(\r
            rf"Find $\\frac{{dy}}{{dx}}$ for $x = {to_latex(x)}$, $y = {to_latex(y)}$ at "\r
            rf"$t = {to_latex(at)}$.",\r
            sympy.simplify(dy0 / dx0),\r
            (),\r
            [steps[0], steps[-1]],\r
        )\r
    if kind == "polar area":\r
        r, low, high, region = rng.choice(\r
            [\r
                (sympy.Integer(c), 0, pi / 2, "the quarter disk"),\r
                (c * sympy.cos(THETA), -pi / 2, pi / 2, "the circle"),\r
                (1 + sympy.cos(THETA), 0, 2 * pi, "the cardioid"),\r
                (sympy.cos(2 * THETA), -pi / 4, pi / 4, "one loop of the rose"),\r
                (sympy.sin(3 * THETA), 0, pi / 3, "one loop of the rose"),\r
            ]\r
        )\r
        curve = build_curve("polar", r * sympy.cos(THETA), r * sympy.sin(THETA), r, (low, high))\r
        step, _, _, value = area(curve)\r
        return Problem(\r
            rf"Find the area of {region} $r = {to_latex(r)}$, "\r
            rf"\${to_latex(low)} \\le \\theta \\le {to_latex(high)}$.",\r
            value,\r
            (),\r
            [step],\r
        )\r
    kind, x, y, r, low, high = rng.choice(\r
        [\r
            ("parametric", c * sympy.cos(T), c * sympy.sin(T), None, 0, pi),\r
            ("parametric", c * (T - sympy.sin(T)), c * (1 - sympy.cos(T)), None, 0, 2 * pi),\r
            ("parametric", T**2, 2 * T**3 / 3, None, 0, 1),\r
            ("polar", None, None, c * (1 + sympy.cos(THETA)), 0, 2 * pi),\r
        ]\r
    )\r
    if kind == "polar":\r
        x, y = r * sympy.cos(THETA), r * sympy.sin(THETA)\r
        description = rf"$r = {to_latex(r)}$, \${to_latex(low)} \\le \\theta \\le {to_latex(high)}$"\r
    else:\r
        description = (\r
            rf"$x = {to_latex(x)}$, $y = {to_latex(y)}$, \${to_latex(low)} \\le t \\le {to_latex(high)}$"\r
        )\r
    curve = build_curve(kind, x, y, r, (sympy.sympify(low), sympy.sympify(high)))\r
    step, _, _, value = arc_length(curve)\r
    return Problem(rf"Find the length of the curve {description}.", value, (), [step])\r
\r
\r
def space_curve_problem(rng):\r
    """The speed or curvature of a space curve at a point, or an arc length\r
    built so that its integral has an exact value."""\r
    pi = sympy.pi\r
    a, b = rng.choice([(3, 4), (4, 3), (1, 1), (5, 12)])\r
    helix = (a * sympy.cos(T), a * sympy.sin(T), b * T)\r
    kind = rng.choice(["speed", "arc length", "curvature"])\r
    if kind == "speed":\r
        (x, y, z), at = rng.choice(\r
            [\r
                (helix, rng.choice([0, pi / 2, pi])),\r
                ((T, T**2, T**3), rng.choice([0, 1, 2])),\r
                ((sympy.exp(T), sympy.exp(-T), sympy.sqrt(2) * T), rng.choice([0, 1])),\r
            ]\r
        )\r
        curve = build_space_curve(x, y, z, (at, at), at)\r
        steps, _ = velocity_steps(curve)\r
        value = sympy.simplify(curve["speed"].subs(T, at))\r
        prompt = rf"Find the speed $|\\mathbf{{r}}'(t)|$ of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ at $t = {to_latex(at)}$."\r
        return Problem(prompt, value, (), steps)\r
    if kind == "arc length":\r
        (x, y, z), low, high = rng.choice(\r
            [\r
                (helix, 0, 2 * pi),\r
                ((sympy.exp(T), sympy.exp(-T), sympy.sqrt(2) * T), 0, 1),\r
                ((sympy.cos(T), sympy.sin(T), T), 0, rng.choice([pi, 2 * pi])),\r
            ]\r
        )\r
        curve = build_space_curve(x, y, z, (sympy.sympify(low), sympy.sympify(high)))\r
        step, _, _, value = arc_length(curve)\r
        prompt = (\r
            rf"Find the length of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ for "\r
            rf"\${to_latex(low)} \\le t \\le {to_latex(high)}$."\r
        )\r
        return Problem(prompt, value, (), [step])\r
    c = rng.choice([2, 3, 5])\r
    (x, y, z), at = rng.choice(\r
        [\r
            (helix, rng.choice([0, pi / 2])),\r
            ((c * sympy.cos(T), c * sympy.sin(T), sympy.Integer(0)), rng.choice([0, pi / 3])),\r
            ((T, T**2, T**3), 0),\r
            ((T, T**2, sympy.Integer(0)), rng.choice([0, 1])),\r
        ]\r
    )\r
    curve = build_space_curve(x, y, z, (at, at), at)\r
    steps, _ = velocity_steps(curve)\r
    step, _ = curvature_steps(curve)\r
    value = sympy.simplify(curve["curvature"].subs(T, at))\r
    prompt = rf"Find the curvature $\\kappa$ of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ at $t = {to_latex(at)}$."\r
    return Problem(prompt, value, (), [*steps, step])\r
\r
\r
def coordinates_problem(rng):\r
    """A triple integral over a solid that is easy in cylindrical or spherical\r
    coordinates, described in words, with an exact answer."""\r
    pi = sympy.pi\r
    a = rng.choice([1, 2, 3])\r
    choices = [\r
        (\r
            "cylindrical",\r
            rf"the volume of the solid under the paraboloid $z = {a**2} - x^2 - y^2$ and above the "\r
            r"$xy$-plane",\r
            sympy.Integer(1),\r
            [(0, a**2 - R**2), (0, a), (0, 2 * pi)],\r
        ),\r
        (\r
            "cylindrical",\r
            rf"$\\iiint_E (x^2 + y^2)\\,dV$, where $E$ is the cylinder $x^2 + y^2 \\le {a**2}$, "\r
            r"$0 \\le z \\le 2$",\r
            X**2 + Y**2,\r
            [(0, 2), (0, a), (0, 2 * pi)],\r
        ),\r
        (\r
            "cylindrical",\r
            rf"$\\iiint_E z\\,dV$, where $E$ is the cylinder $x^2 + y^2 \\le {a**2}$, $0 \\le z \\le 3$",\r
            Z,\r
            [(0, 3), (0, a), (0, 2 * pi)],\r
        ),\r
        (\r
            "spherical",\r
            rf"the volume of the ball $x^2 + y^2 + z^2 \\le {a**2}$",\r
            sympy.Integer(1),\r
            [(0, a), (0, pi), (0, 2 * pi)],\r
        ),\r
        (\r
            "spherical",\r
            rf"the volume of the upper half of the ball $x^2 + y^2 + z^2 \\le {a**2}$",\r
            sympy.Integer(1),\r
            [(0, a), (0, pi / 2), (0, 2 * pi)],\r
        ),\r
        (\r
            "spherical",\r
            r"$\\iiint_B (x^2 + y^2 + z^2)\\,dV$, where $B$ is the unit ball $x^2 + y^2 + z^2 \\le 1$",\r
            X**2 + Y**2 + Z**2,\r
            [(0, 1), (0, pi), (0, 2 * pi)],\r
        ),\r
        (\r
            "spherical",\r
            r"the volume of the solid above the cone $z = \\sqrt{x^2 + y^2}$ and below the sphere "\r
            r"$x^2 + y^2 + z^2 = z$",\r
            sympy.Integer(1),\r
            [(0, sympy.cos(PHI)), (0, pi / 4), (0, 2 * pi)],\r
        ),\r
    ]\r
    coordinates, description, function, bounds = rng.choice(choices)\r
    system = COORDINATE_SYSTEMS[coordinates]\r
    bounds = [tuple(map(sympy.sympify, pair)) for pair in bounds]\r
    step, integrand = change_coordinates(function, system)\r
    _, steps, (_, _, value) = iterated_triple_integral(integrand, system["variables"], bounds)\r
    return Problem(rf"Use {coordinates} coordinates to find {description}.", value, (), [step, *steps])\r
\r
\r
def directional_problem(rng):\r
    """A directional derivative at a point (in the direction of a vector or an\r
    angle), or the maximum rate of change there."""\r
    c = rng.choice([1, 2, 3])\r
    function = rng.choice(\r
        [X**2 * Y + c * Y**2, X * Y**2 - c * X, c * X**2 + X * Y, X**3 - c * X * Y, Y * sympy.exp(X)]\r
    )\r
    point = (sympy.Integer(rng.choice([1, 2])), sympy.Integer(rng.choice([-1, 1, 2])))\r
    kind = rng.choice(["vector", "vector", "angle", "maximum"])\r
    if kind == "angle":\r
        angle = rng.choice([sympy.pi / 4, sympy.pi / 3, sympy.pi / 2, sympy.pi])\r
        given = ("angle", angle)\r
        vector = sympy.Matrix([sympy.cos(angle), sympy.sin(angle)])\r
        direction = rf"at angle $\\theta = {to_latex(angle)}$ from the positive $x$-axis"\r
    else:\r
        vector = sympy.Matrix(rng.choice([(3, 4), (4, -3), (1, 1), (-1, 2), (5, 12)]))\r
        given = ("vector", vector)\r
        direction = rf"in the direction of $\\mathbf{{v}} = {vector_latex(vector)}$"\r
    solved = solve_directional(function, (X, Y), point, vector, given)\r
    at = rf"({to_latex(point[0])}, {to_latex(point[1])})"\r
    if kind == "maximum":\r
        return Problem(\r
            rf"Find the maximum rate of change of $f(x, y) = {to_latex(function)}$ at \${at}$.",\r
            solved["largest"],\r
            (),\r
            # Every step but the directional derivative's own, which isn't asked for.\r
            [step for step in solved["steps"] if step["rule"] not in ("Unit vector", "Directional derivative")],\r
        )\r
    return Problem(\r
        rf"Find the directional derivative of $f(x, y) = {to_latex(function)}$ at \${at}$ {direction}.",\r
        solved["rate"],\r
        (),\r
        [step for step in solved["steps"] if step["rule"] != "Maximum rate of change"],\r
    )\r
\r
\r
def tangent_problem(rng):\r
    """The linearization of f at a point (an expression in x and y), or the\r
    linear approximation of f at a nearby point (a number)."""\r
    c = rng.choice([1, 2, 3])\r
    function = rng.choice(\r
        [X**2 + c * Y**2, X * Y + c * X, X**2 * Y - c * Y, sympy.sqrt(X**2 + Y**2), X * sympy.exp(Y)]\r
    )\r
    point = (sympy.Integer(rng.choice([1, 2])), sympy.Integer(rng.choice([0, 1, 2])))\r
    if function == sympy.sqrt(X**2 + Y**2):\r
        point = rng.choice([(sympy.Integer(3), sympy.Integer(4)), (sympy.Integer(4), sympy.Integer(3))])\r
    at = rf"({to_latex(point[0])}, {to_latex(point[1])})"\r
    if rng.choice(["linearization", "approximation"]) == "linearization":\r
        solved = solve_graph(function, point)\r
        return Problem(\r
            rf"Find the linearization $L(x, y)$ of $f(x, y) = {to_latex(function)}$ at \${at}$.",\r
            solved["plane"],\r
            (X, Y),\r
            solved["steps"],\r
        )\r
    near = (point[0] + sympy.Rational(rng.choice([1, -1]), 10), point[1] + sympy.Rational(rng.choice([1, -1]), 10))\r
    solved = solve_graph(function, point, near)\r
    there = rf"({to_latex(near[0])}, {to_latex(near[1])})"\r
    return Problem(\r
        rf"Use the linearization of $f(x, y) = {to_latex(function)}$ at \${at}$ to approximate "\r
        rf"$f{there}$.",\r
        solved["approximate"],\r
        (),\r
        # Every step but the comparison with the exact value and dz, which aren't asked for.\r
        [step for step in solved["steps"] if step["rule"] != "Differential"],\r
    )\r
\r
\r
def optimization_problem(rng):\r
    """The local maximum or minimum value of a quadratic f(x, y), or the\r
    maximum of a linear f on a circle by Lagrange multipliers (a number)."""\r
    if rng.choice(["critical", "lagrange"]) == "critical":\r
        a, b = rng.choice([-2, -1, 1, 2, 3]), rng.choice([-2, -1, 1, 2, 3])\r
        stretch = rng.choice([1, 2, 3])\r
        # Not 0: hints say "f_x = 0", which would read as giving the answer away.\r
        value = rng.choice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5])\r
        sign = rng.choice([1, -1])\r
        function = sympy.expand(value + sign * ((X - a) ** 2 + stretch * (Y - b) ** 2))\r
        kind = "minimum" if sign > 0 else "maximum"\r
        return Problem(\r
            rf"Find the local {kind} value of $f(x, y) = {to_latex(function)}$.",\r
            sympy.Integer(value),\r
            (),\r
            solve_critical(function)["steps"],\r
        )\r
    a, b = rng.choice([(3, 4), (4, 3), (1, 1), (1, 2), (2, 1), (5, 12)])\r
    a, b = a * rng.choice([1, -1]), b * rng.choice([1, -1])\r
    radius_squared = sympy.Integer(rng.choice([1, 4, 9]))\r
    function = a * X + b * Y\r
    solved = solve_lagrange(function, X**2 + Y**2, radius_squared, (X, Y))\r
    return Problem(\r
        rf"Use Lagrange multipliers to find the maximum value of $f(x, y) = {to_latex(function)}$ on "\r
        rf"the circle $x^2 + y^2 = {to_latex(radius_squared)}$.",\r
        solved["maximum"][0],\r
        (),\r
        solved["steps"],\r
    )\r
\r
\r
def line_integral_problem(rng):\r
    """A line integral along a segment from the origin: of a function, of a\r
    field, or of a gradient field (a number)."""\r
    p, q = rng.choice([(3, 4), (4, 3), (1, 2), (2, 1), (1, 1), (2, 3)])\r
    position = sympy.Matrix([p * T, q * T])\r
    interval = (sympy.Integer(0), sympy.Integer(1))\r
    segment = rf"the line segment from $(0, 0)$ to $({p}, {q})$"\r
    kind = rng.choice(["scalar", "vector", "conservative"])\r
    if kind == "scalar":\r
        a, b = rng.choice([1, 2, 3]), rng.choice([1, 2])\r
        function = a * X + b * Y\r
        solved = solve_line_integral("scalar", position, interval, (X, Y), function)\r
        return Problem(\r
            rf"Evaluate $\\int_C ({to_latex(function)})\\, ds$, where $C$ is {segment}.",\r
            solved["value"],\r
            (),\r
            solved["steps"],\r
        )\r
    if kind == "vector":\r
        a, b = rng.choice([1, 2, 3]), rng.choice([-1, 1, 2])\r
        field = sympy.Matrix([a * Y, b * X**2])\r
    else:\r
        potential = rng.choice([X**2 * Y, X * Y**2, X * Y + X, X**2 + Y**2])\r
        field = sympy.Matrix([sympy.diff(potential, X), sympy.diff(potential, Y)])\r
    solved = solve_line_integral("vector", position, interval, (X, Y), field)\r
    return Problem(\r
        rf"Evaluate $\\int_C \\mathbf{{F}} \\cdot d\\mathbf{{r}}$ for $\\mathbf{{F}} = {vector_latex(field)}$, "\r
        rf"where $C$ is {segment}.",\r
        solved["value"],\r
        (),\r
        solved["steps"],\r
    )\r
\r
\r
def green_problem(rng):\r
    """A line integral around a rectangle or a triangle, by Green's theorem. The\r
    hints are the steps of the quick way, the double integral."""\r
    p, q = rng.choice([(1, 2), (2, 1), (2, 3), (3, 2), (1, 3), (3, 1)])\r
    a, b = rng.choice([1, 2, 3]), rng.choice([1, 2, 3])\r
    field = rng.choice(\r
        [\r
            sympy.Matrix([a * Y**2, b * X * Y]),\r
            sympy.Matrix([-a * Y, b * X]),\r
            sympy.Matrix([a * X * Y, b * X**2]),\r
            sympy.Matrix([X**2 - a * Y, b * X + Y**2]),\r
        ]\r
    )\r
    width, height = sympy.Integer(p), sympy.Integer(q)\r
    if rng.choice(["rectangle", "triangle"]) == "rectangle":\r
        region = make_region("dy dx", (sympy.Integer(0), height), (sympy.Integer(0), width))\r
        shape = rf"the rectangle with corners $(0, 0)$, $({p}, 0)$, $({p}, {q})$, and $(0, {q})$"\r
    else:\r
        region = make_region("dy dx", (sympy.Integer(0), height - height / width * X), (sympy.Integer(0), width))\r
        shape = rf"the triangle with corners $(0, 0)$, $({p}, 0)$, and $(0, {q})$"\r
    solved = solve_green(field, region)\r
    P, Q = (to_latex(component) for component in field)\r
    return Problem(\r
        rf"Use Green's theorem to evaluate $\\oint_C ({P})\\,dx + ({Q})\\,dy$, where $C$ is the boundary "\r
        rf"of {shape}, traced counterclockwise.",\r
        solved["double"],\r
        (),\r
        solved["steps"][:3],\r
    )\r
\r
\r
GENERATORS = {\r
    "vectors": vector_problem,\r
    "partial-derivatives": partial_derivative_problem,\r
    "double-integrals": double_integral_problem,\r
    "triple-integrals": triple_integral_problem,\r
    "parametric-polar": curve_problem,\r
    "space-curves": space_curve_problem,\r
    "cylindrical-spherical": coordinates_problem,\r
    "directional-derivatives": directional_problem,\r
    "tangent-planes": tangent_problem,\r
    "optimization": optimization_problem,\r
    "line-integrals": line_integral_problem,\r
    "greens-theorem": green_problem,\r
}\r
\r
\r
def build_problem(request):\r
    generator = GENERATORS.get(request.get("lesson"))\r
    seed = request.get("seed")\r
    if generator is None or not isinstance(seed, int):\r
        raise InputError("That practice problem doesn't exist.")\r
    return generator(random.Random(seed))\r
\r
\r
def practice(request):\r
    problem = build_problem(request)\r
    return {\r
        "ok": True,\r
        "operation": "practice",\r
        "prompt": problem.prompt,\r
        "variables": [variable.name for variable in problem.variables],\r
    }\r
\r
\r
def is_correct(answer, expected, variables):\r
    if sympy.simplify(answer - expected) == 0:\r
        return True\r
    if variables:\r
        return agree_numerically(answer, expected, variables)\r
    try:\r
        answer_value, expected_value = complex(answer.evalf(30)), complex(expected.evalf(30))\r
    except TypeError:  # Something symbolic remained, so it can't be compared as a number.\r
        return False\r
    return abs(answer_value - expected_value) <= DECIMAL_TOLERANCE * max(1, abs(expected_value))\r
\r
\r
def check(request):\r
    problem = build_problem(request)\r
    answer = parse_function(latex_to_text(request.get("answer", "")), problem.variables)\r
    correct = is_correct(answer, problem.expected, problem.variables)\r
    return {\r
        "ok": True,\r
        "operation": "check",\r
        "correct": correct,\r
        "answerLatex": to_latex(problem.expected),\r
        "yourAnswerLatex": to_latex(answer),\r
        "steps": problem.steps,\r
    }\r
\r
\r
def solution(request):\r
    """The answer and its steps. The page turns the steps into hints and never\r
    shows the answer early."""\r
    problem = build_problem(request)\r
    return {\r
        "ok": True,\r
        "operation": "solution",\r
        "answerLatex": to_latex(problem.expected),\r
        "steps": problem.steps,\r
    }\r
`,"./python/mathlab/progress.py":`"""Progress messages for long calculations, shown on the page while it waits.

run_request() sets a listener for the duration of a request; any module can
call report() to say what it is trying, such as "Trying the textbook rules…".
"""

_listener = None


def listen(listener):
    """Send reports to listener (a function taking a message), or stop with None."""
    global _listener
    _listener = listener


def report(message):
    if _listener is not None:
        _listener(message)
`,"./python/mathlab/region.py":`"""Help for iterated integrals over a region: sample points inside it, and
simplifying a partial result where it is used, inside the region.

An inner integral's result often comes back in a form SymPy can't simplify on
its own, because SymPy doesn't know the region. Over the unit disk, the middle
integral of the ball's volume comes back as
2(1 − x²) arcsin(√(1/(1 − x²)) √(1 − x²)), inside "if −1 < x < 1": the arcsine
is π/2 everywhere in the region, but SymPy can't assume 1 − x² > 0, and
integrating the unsimplified form gave a wrong answer. Every rewrite here is
kept only if it agrees numerically with the original at points inside the
region, and the final answer is checked independently as well.
"""

import mpmath
import sympy

# Where sample points sit inside each variable's interval, as fractions of its
# width. Rewrites are found with the first set and must also hold on the
# second, irregular one, so a wave like sin(6πx), which is 0 at every sixth,
# can't pass for a constant.
SAMPLE_FRACTIONS = [sympy.Rational(index, 6) for index in range(1, 6)]
CHECK_FRACTIONS = [sympy.Rational(n, d) for n, d in ((13, 97), (31, 89), (47, 83), (59, 79), (71, 73))]
AGREEMENT_TOLERANCE = 1e-12
# A rounding-size imaginary part, as from √(1 − x²) evaluated just outside the
# region's edge, is dropped when it is at most this fraction of the real part.
IMAGINARY_TOLERANCE = mpmath.mpf("1e-9")


def real_number(value):
    """value as a real mpf, dropping a rounding-size imaginary part."""
    if isinstance(value, mpmath.mpc) and abs(value.imag) <= IMAGINARY_TOLERANCE * max(1, abs(value.real)):
        return value.real
    return value


def sample_points(variables, bounds, fractions):
    """Exact points inside the region, as substitution dictionaries.

    variables run from the innermost of those sampled outward, and bounds[i]
    is the (lower, upper) pair of variables[i], which may use the variables
    after it. The last pair is numbers.
    """
    points = [{}]
    for variable, (low, high) in reversed(list(zip(variables, bounds))):
        next_points = []
        for point in points:
            ends = [sympy.sympify(bound).subs(point) for bound in (low, high)]
            if not all(end.is_real for end in ends) or ends[0] == ends[1]:
                continue  # Outside the region, or where it has no width.
            next_points.extend(
                {**point, variable: ends[0] + (ends[1] - ends[0]) * fraction} for fraction in fractions
            )
        points = next_points
    return points


def numeric_value(expression, point):
    try:
        return complex(expression.subs(point).evalf(30))
    except (TypeError, ValueError):  # Something symbolic remained.
        return None


def agree(first, second, points):
    for point in points:
        a, b = numeric_value(first, point), numeric_value(second, point)
        if a is None or b is None or abs(a - b) > AGREEMENT_TOLERANCE * max(1, abs(a)):
            return False
    return True


def choose_piece(expression, points):
    """The piece of a Piecewise that holds at every point, or the expression itself."""
    chosen = set()
    for point in points:
        for index, (_, condition) in enumerate(expression.args):
            holds = condition.subs(point)
            if holds is sympy.true:
                chosen.add(index)
                break
            if holds is not sympy.false:
                return expression  # Can't tell, so keep every piece.
    if len(chosen) != 1:
        return expression
    return expression.args[chosen.pop()][0]


def is_constant(expression, points):
    values = [numeric_value(expression, point) for point in points]
    if any(value is None for value in values):
        return False
    return all(abs(value - values[0]) <= AGREEMENT_TOLERANCE * max(1, abs(values[0])) for value in values)


def rewrite(expression, variables, points):
    """Replace pieces that are constant inside the region with their exact values,
    and Piecewise expressions with the piece that holds there."""
    if (
        not isinstance(expression, sympy.Expr)
        or expression.is_Atom
        or not expression.free_symbols & set(variables)
    ):
        return expression
    if isinstance(expression, sympy.Piecewise):
        piece = choose_piece(expression, points)
        # A Piecewise whose piece can't be chosen is kept whole.
        return expression if piece is expression else rewrite(piece, variables, points)
    if not expression.is_polynomial(*variables) and is_constant(expression, points):
        return sympy.simplify(expression.subs(points[0]))
    return expression.func(*(rewrite(argument, variables, points) for argument in expression.args))


def simplify_on_region(expression, variables, bounds):
    """expression, a function of variables, simplified for points inside the
    region; unchanged if no simpler form agrees with it there."""
    if not expression.free_symbols & set(variables):
        return expression
    points = sample_points(variables, bounds, SAMPLE_FRACTIONS)
    check_points = sample_points(variables, bounds, CHECK_FRACTIONS)
    if not points or not check_points:
        return expression
    try:
        simpler = sympy.simplify(rewrite(expression, variables, points))
    except Exception:  # Simplifying is optional; any failure keeps the original.
        return expression
    if simpler == expression or not agree(simpler, expression, points + check_points):
        return expression
    return simpler
`,"./python/mathlab/riemann.py":`"""The double-integrals lesson picture: a Riemann sum of boxes under z = f(x, y).

The rectangle [a, b] × [c, d] is cut into m × n small rectangles. Each one
gets a box whose height is f at a sample point in it, and the boxes' total
volume approximates the double integral, which SymPy computes exactly.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function, plot_value
from mathlab.definite import parse_bound
from mathlab.expressions import X, Y, InputError, to_latex

# Where in each small rectangle f is sampled, as fractions of its width and height.
SAMPLE_POINTS = {"lower-left": (0, 0), "midpoint": (0.5, 0.5), "upper-right": (1, 1)}
MAX_DIVISIONS = 16
SURFACE_POINT_COUNT = 31


def parse_rectangle(texts):
    """[a, b, c, d] as LaTeX, for the rectangle a ≤ x ≤ b, c ≤ y ≤ d."""
    if not (isinstance(texts, list) and len(texts) == 4):
        raise InputError("Enter the rectangle as four numbers: a, b, c, and d.")
    names = ("x lower", "x upper", "y lower", "y upper")
    bounds = [parse_bound(text, name) for text, name in zip(texts, names)]
    if any(bound.is_infinite for bound in bounds):
        raise InputError("The rectangle must be finite.")
    a, b, c, d = bounds
    if not ((b - a).is_positive and (d - c).is_positive):
        raise InputError("Each lower bound of the rectangle must be less than its upper bound.")
    return bounds


def parse_divisions(raw):
    if not (
        isinstance(raw, list)
        and len(raw) == 2
        and all(isinstance(value, int) and not isinstance(value, bool) for value in raw)
        and all(1 <= value <= MAX_DIVISIONS for value in raw)
    ):
        raise InputError(f"Cut each side into 1 to {MAX_DIVISIONS} pieces.")
    return raw


def edges(low, high, count):
    return [float(low + (high - low) * index / count) for index in range(count + 1)]


def riemann_sum(function, rectangle_texts, divisions, sample):
    if function.free_symbols - {X, Y}:
        raise InputError("The picture needs numbers, so use only x and y here.")
    if sample not in SAMPLE_POINTS:
        raise InputError("Choose where to sample f: lower-left corner, midpoint, or upper-right corner.")
    a, b, c, d = parse_rectangle(rectangle_texts)
    m, n = parse_divisions(divisions)
    as_numeric = numeric_function(function, (X, Y))
    x_edges, y_edges = edges(a, b, m), edges(c, d, n)
    s, t = SAMPLE_POINTS[sample]
    sample_x = [x_edges[i] + s * (x_edges[i + 1] - x_edges[i]) for i in range(m)]
    sample_y = [y_edges[j] + t * (y_edges[j + 1] - y_edges[j]) for j in range(n)]

    # One row of box heights per strip in y, like the surface rows.
    heights = [
        [plot_value(lambda x=x, y=y: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in sample_x]
        for y in sample_y
    ]
    if any(height is None for row in heights for height in row):
        raise InputError("f isn't defined at every sample point, so the boxes can't be drawn.")
    box_area = float((b - a) * (d - c)) / (m * n)
    total = box_area * sum(sum(row) for row in heights)

    exact = sympy.integrate(function, (X, a, b), (Y, c, d))
    exact_value = plot_value(lambda: sympy.N(exact, 20))
    if exact_value is None:
        raise InputError("The double integral over this rectangle has no finite value.")

    xs, ys = edges(a, b, SURFACE_POINT_COUNT - 1), edges(c, d, SURFACE_POINT_COUNT - 1)
    surface = [[plot_value(lambda x=x, y=y: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in xs] for y in ys]
    return {
        "ok": True,
        "operation": "riemann",
        "sample": sample,
        "xEdges": x_edges,
        "yEdges": y_edges,
        "sampleX": sample_x,
        "sampleY": sample_y,
        "heights": heights,
        "boxArea": box_area,
        "sum": total,
        "exact": exact_value,
        "exactLatex": to_latex(exact),
        "surface": {"x": xs, "y": ys, "z": surface},
    }
`,"./python/mathlab/solid.py":`"""The triple-integrals lesson picture: a solid E, a slice of it, and a line
through the slice.

The solid is given as a triple integral's bounds. Fixing the outermost
variable cuts a slice; fixing the middle variable too leaves a line across
the slice. With f = 1, the innermost integral is the line's length, the
middle integral is the slice's area, and the outermost integral is the
solid's volume. Every slider position is computed here at once, so moving
a slider needs no new request.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.expressions import X, Y, Z, InputError, to_latex
from mathlab.region import real_number
from mathlab.triple import ORDERS, iterated_triple_integral, parse_bounds

# Slider positions: the outermost variable takes OUTER_STEPS + 1 values, and
# the middle variable MIDDLE_STEPS + 1 values across each slice.
OUTER_STEPS = 20
MIDDLE_STEPS = 20
# Grid points along each side of the boundary surfaces.
SURFACE_POINTS = 25
DIGITS = 5


def as_float(compute):
    """compute()'s value as a float, or None where it has no real value."""
    try:
        value = real_number(mpmath.mpmathify(compute()))
    except Exception:  # Undefined points raise many error types; all mean "no value here".
        return None
    if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
        return None
    # Rounded, which keeps the reply small; the picture needs no more digits.
    return round(float(value), DIGITS)


def fractions(steps):
    return [index / steps for index in range(steps + 1)]


class Solid:
    """The bounds as numeric functions, and a way to place a point
    (outer, middle, inner) at its (x, y, z) coordinates."""

    def __init__(self, variables, bounds):
        inner, middle, outer = variables
        self.inner_low, self.inner_high = (numeric_function(b, (middle, outer)) for b in bounds[0])
        self.middle_low, self.middle_high = (numeric_function(b, (outer,)) for b in bounds[1])
        self.outer_low, self.outer_high = (float(sympy.N(b)) for b in bounds[2])
        # Where each of x, y, z sits in (outer, middle, inner).
        self.axis = [(outer, middle, inner).index(symbol) for symbol in (X, Y, Z)]

    def outer_at(self, s):
        return self.outer_low + s * (self.outer_high - self.outer_low)

    def middle_at(self, o, t):
        low = as_float(lambda: self.middle_low(o))
        high = as_float(lambda: self.middle_high(o))
        if low is None or high is None:
            return None
        return low + t * (high - low)

    def inner_range(self, m, o):
        if m is None:
            return None, None
        return as_float(lambda: self.inner_low(m, o)), as_float(lambda: self.inner_high(m, o))

    def place(self, o, m, n):
        """(x, y, z) for the point whose outer, middle, and inner values are o, m, n."""
        values = (o, m, n)
        if None in values:
            return None, None, None
        return tuple(round(values[index], DIGITS) for index in self.axis)


def grid(solid, point_at):
    """A parametric surface: point_at(u, v) over [0, 1]², as x, y, z rows."""
    rows = [[point_at(u, v) for u in fractions(SURFACE_POINTS - 1)] for v in fractions(SURFACE_POINTS - 1)]
    return {
        name: [[point[index] for point in row] for row in rows]
        for index, name in enumerate(("x", "y", "z"))
    }


def boundary(solid):
    """The solid's surface: its bottom and top (innermost bounds), and walls
    standing on the four edges of the region the middle and outer bounds trace."""

    def on_region(s, t, w=None, level=None):
        o = solid.outer_at(s)
        m = solid.middle_at(o, t)
        low, high = solid.inner_range(m, o)
        if low is None or high is None:
            return None, None, None
        n = {"bottom": low, "top": high}.get(level, None if w is None else low + w * (high - low))
        return solid.place(o, m, n)

    return [
        grid(solid, lambda s, t: on_region(s, t, level="bottom")),
        grid(solid, lambda s, t: on_region(s, t, level="top")),
        grid(solid, lambda s, w: on_region(s, 0, w)),
        grid(solid, lambda s, w: on_region(s, 1, w)),
        grid(solid, lambda t, w: on_region(0, t, w)),
        grid(solid, lambda t, w: on_region(1, t, w)),
    ]


def solid_picture(order, bound_texts):
    if order not in ORDERS:
        raise InputError("Choose the order of integration, such as dz dy dx.")
    variables = ORDERS[order]
    bounds = parse_bounds(variables, bound_texts)
    _, _, (line_length, slice_area, volume) = iterated_triple_integral(sympy.Integer(1), variables, bounds)
    _, middle, outer = variables
    length_at = numeric_function(line_length, (middle, outer))
    area_at = numeric_function(slice_area, (outer,))
    solid = Solid(variables, bounds)

    positions = []
    for s in fractions(OUTER_STEPS):
        o = solid.outer_at(s)
        lines = []
        for t in fractions(MIDDLE_STEPS):
            m = solid.middle_at(o, t)
            low, high = solid.inner_range(m, o)
            lines.append(
                {
                    "middle": None if m is None else round(m, DIGITS),
                    "ends": [list(solid.place(o, m, low)), list(solid.place(o, m, high))],
                    "length": as_float(lambda m=m: length_at(m, o)) if m is not None else None,
                }
            )
        # The slice: the region the lines sweep, as two rows (their low and high ends).
        slice_surface = {
            name: [[line["ends"][end][index] for line in lines] for end in (0, 1)]
            for index, name in enumerate(("x", "y", "z"))
        }
        positions.append(
            {
                "outer": round(o, DIGITS),
                "area": as_float(lambda: area_at(o)),
                "slice": slice_surface,
                "lines": lines,
            }
        )

    volume_value = as_float(lambda: sympy.N(volume, 20))
    if volume_value is None:
        raise InputError("This solid's volume has no finite value.")
    return {
        "ok": True,
        "operation": "solid",
        "variables": [str(variable) for variable in variables],
        "surfaces": boundary(solid),
        "positions": positions,
        "volume": volume_value,
        "volumeLatex": to_latex(volume),
    }
`,"./python/mathlab/space_curves.py":`"""Space curves: vector functions r(t) = ⟨x(t), y(t), z(t)⟩.

The velocity r'(t) points along the curve, and its length is the speed.
Dividing by the speed gives the unit tangent T; the arc length integrates
the speed (with the same exact-or-numerical approach as plane curves); and
the curvature κ = |r' × r''| / |r'|³ measures how fast T turns per unit of
length. The unit normal N points the way the curve bends.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.curves import arc_length, latex_value, numerical_integral, parse_curve_function, parse_interval
from mathlab.definite import parse_bound
from mathlab.expressions import T, InputError, to_latex
from mathlab.progress import report
from mathlab.region import real_number
from mathlab.steps import make_step, separate
from mathlab.vectors import vector_latex

GRAPH_POINTS = 401
TRACE_STEPS = 120


def build_space_curve(x, y, z, interval, at=None):
    velocity = sympy.Matrix([sympy.diff(component, T) for component in (x, y, z)])
    return {
        "kind": "space",
        "parameter": T,
        "position": sympy.Matrix([x, y, z]),
        "velocity": velocity,
        "acceleration": velocity.diff(T),
        "dxdt": velocity[0],
        "dydt": velocity[1],
        "dzdt": velocity[2],
        "interval": interval,
        "at": at,
    }


def space_curve_from_request(request):
    x, y, z = (
        parse_curve_function(request.get(key), name, T)
        for key, name in (("xExpression", "x(t)"), ("yExpression", "y(t)"), ("zExpression", "z(t)"))
    )
    low, high = parse_interval(request.get("lower"), request.get("upper"), T)
    at = None
    at_text = request.get("at")
    if isinstance(at_text, str) and at_text.strip():
        at = parse_bound(at_text, "point's t")
        if at.is_infinite:
            raise InputError("The point's t must be a number.")
    return build_space_curve(x, y, z, (low, high), at)


# Expressions with more operations than this aren't simplified: on formulas
# like the curvature of a curve with e^t and sin 2t, SymPy takes many seconds
# and finds little shorter. Textbook curves give small expressions, which are,
# and so are plain numbers (values at one point), which simplify quickly.
SIMPLIFY_LIMIT = 30


def tidy(expression):
    if expression.free_symbols and sympy.count_ops(expression) > SIMPLIFY_LIMIT:
        return expression
    return sympy.simplify(expression)


def magnitude(vector):
    return sympy.sqrt(tidy(vector.dot(vector)))


def simplified(vector):
    return vector.applyfunc(tidy)


def velocity_steps(curve):
    """r'(t), r''(t), and the speed |r'(t)|: the steps and the results."""
    velocity, acceleration = curve["velocity"], curve["acceleration"]
    speed = tidy(magnitude(velocity))
    curve["speed"] = speed
    steps = [
        make_step(
            "Velocity",
            r"Differentiate each component: the derivative of a vector function is the vector of "
            r"its components' derivatives. It points along the curve, in the direction of motion.",
            [rf"\\mathbf{{r}}'(t) = {vector_latex(velocity)}"],
        ),
        make_step(
            "Speed",
            r"The speed is the length of the velocity vector, $|\\mathbf{r}'(t)| = \\sqrt{x'^2 + y'^2 + z'^2}$.",
            [rf"|\\mathbf{{r}}'(t)| = \\sqrt{{{to_latex(sympy.expand(velocity.dot(velocity)))}}}", to_latex(speed)],
        ),
    ]
    results = [
        {"label": "Velocity", "latex": rf"\\mathbf{{r}}'(t) = {vector_latex(velocity)}"},
        {"label": "Speed", "latex": rf"|\\mathbf{{r}}'(t)| = {to_latex(speed)}"},
        {"label": "Acceleration", "latex": rf"\\mathbf{{r}}''(t) = {vector_latex(acceleration)}"},
    ]
    return steps, results


def curvature_steps(curve):
    """The curvature κ(t): its step, its result, and its value as a function of t."""
    velocity, acceleration, speed = curve["velocity"], curve["acceleration"], curve["speed"]
    cross = simplified(velocity.cross(acceleration))
    cross_length = tidy(magnitude(cross))
    curvature = tidy(cross_length / speed**3)
    step = make_step(
        "Curvature",
        r"Curvature measures how fast the direction turns per unit of length: "
        r"$\\kappa = \\left|\\frac{d\\mathbf{T}}{ds}\\right|$. In terms of $t$ it is "
        r"$\\kappa = \\frac{|\\mathbf{r}' \\times \\mathbf{r}''|}{|\\mathbf{r}'|^3}$: the cross product "
        r"keeps the part of the acceleration that turns the curve and drops the part that only "
        r"changes the speed.",
        [
            separate(
                rf"\\mathbf{{r}}' \\times \\mathbf{{r}}'' = {vector_latex(cross)}",
                rf"\\kappa(t) = \\frac{{|\\mathbf{{r}}' \\times \\mathbf{{r}}''|}}{{|\\mathbf{{r}}'|^3}} = "
                rf"\\frac{{{to_latex(cross_length)}}}{{\\left({to_latex(speed)}\\right)^3}} = "
                rf"{to_latex(curvature)}",
            )
        ],
    )
    curve["curvature"] = curvature
    return step, {"label": "Curvature", "latex": rf"\\kappa(t) = {to_latex(curvature)}"}


def point_steps(curve):
    """At the chosen t: the point, T, κ, and N. Steps and results."""
    at = curve["at"]
    at_text = rf"t = {to_latex(at)}"
    point = simplified(curve["position"].subs(T, at))
    velocity = simplified(curve["velocity"].subs(T, at))
    acceleration = simplified(curve["acceleration"].subs(T, at))
    speed = tidy(magnitude(velocity))
    curve["point"] = (point, velocity, None)
    results = [{"label": "Point", "latex": rf"\\mathbf{{r}}({to_latex(at)}) = {vector_latex(point)}"}]
    if speed == 0:
        step = make_step(
            "Unit tangent vector",
            rf"The velocity is $\\mathbf{{0}}$ at \${at_text}$: the point stops for an instant, so it "
            r"has no direction there, and $\\mathbf{T}$, $\\kappa$, and $\\mathbf{N}$ aren't defined.",
            [rf"\\mathbf{{r}}'({to_latex(at)}) = \\mathbf{{0}}"],
        )
        results.append({"label": "Unit tangent", "latex": r"\\text{undefined: } \\mathbf{r}' = \\mathbf{0}"})
        return [step], results
    tangent = simplified(velocity / speed)
    steps = [
        make_step(
            "Unit tangent vector",
            r"Divide the velocity by its length, which keeps its direction and makes its length 1: "
            r"$\\mathbf{T} = \\frac{\\mathbf{r}'}{|\\mathbf{r}'|}$.",
            [
                separate(
                    rf"\\mathbf{{r}}'({to_latex(at)}) = {vector_latex(velocity)}, \\quad |\\mathbf{{r}}'({to_latex(at)})| = {to_latex(speed)}",
                    rf"\\mathbf{{T}}({to_latex(at)}) = {vector_latex(tangent)}",
                )
            ],
        )
    ]
    results.append({"label": "Unit tangent", "latex": rf"\\mathbf{{T}}({to_latex(at)}) = {vector_latex(tangent)}"})
    curvature = sympy.simplify(curve["curvature"].subs(T, at))
    steps.append(
        make_step(
            "Curvature at a point",
            rf"Put \${to_latex(at)}$ in for $t$ in $\\kappa(t)$. The circle that fits the curve best "
            r"here, the osculating circle, has radius $\\frac{1}{\\kappa}$.",
            [rf"\\kappa({to_latex(at)}) = {latex_value(curvature)}"],
        )
    )
    results.append({"label": "Curvature at the point", "latex": rf"\\kappa({to_latex(at)}) = {latex_value(curvature)}"})
    # The part of the acceleration across the direction of motion turns the
    # curve, and it points along N.
    across = simplified(acceleration - acceleration.dot(tangent) * tangent)
    across_length = tidy(magnitude(across))
    if across_length == 0:
        steps.append(
            make_step(
                "Unit normal vector",
                r"The curvature is $0$ here: the curve is straight for an instant, so it doesn't "
                r"bend toward any side, and $\\mathbf{N}$ isn't defined.",
                [],
            )
        )
        results.append({"label": "Unit normal", "latex": r"\\text{undefined: } \\kappa = 0"})
        return steps, results
    normal = simplified(across / across_length)
    curve["point"] = (point, velocity, normal)
    steps.append(
        make_step(
            "Unit normal vector",
            r"$\\mathbf{N} = \\frac{\\mathbf{T}'}{|\\mathbf{T}'|}$ points the way the curve bends. It is "
            r"also the direction of the part of the acceleration perpendicular to the motion, "
            r"$\\mathbf{r}'' - (\\mathbf{r}'' \\cdot \\mathbf{T})\\mathbf{T}$, which is easier to compute "
            r"at one point.",
            [
                separate(
                    rf"\\mathbf{{r}}'' - (\\mathbf{{r}}'' \\cdot \\mathbf{{T}})\\mathbf{{T}} = {vector_latex(across)}",
                    rf"\\mathbf{{N}}({to_latex(at)}) = {vector_latex(normal)}",
                )
            ],
        )
    )
    results.append({"label": "Unit normal", "latex": rf"\\mathbf{{N}}({to_latex(at)}) = {vector_latex(normal)}"})
    return steps, results


def numeric_value(function, point):
    try:
        value = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
    except Exception:  # Undefined points raise many error types; all mean "no value".
        return None
    if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
        return None
    return round(float(value), 6)


def curve_points(curve, count):
    """count parameter values across the interval, and the curve's x, y, z there."""
    low, high = (float(sympy.N(bound)) for bound in curve["interval"])
    parameters = [low + (high - low) * index / (count - 1) for index in range(count)]
    functions = [numeric_function(component, (T,)) for component in curve["position"]]
    return parameters, [[numeric_value(function, t) for t in parameters] for function in functions]


def graph_samples(curve):
    _, (xs, ys, zs) = curve_points(curve, GRAPH_POINTS)
    graph = {"x": xs, "y": ys, "z": zs, "point": None, "tangent": None, "normal": None}
    if curve.get("point"):
        point, velocity, normal = curve["point"]
        graph["point"] = [float(sympy.N(component)) for component in point]
        speed = float(sympy.N(magnitude(velocity)))
        if speed > 0:
            graph["tangent"] = [float(sympy.N(component)) / speed for component in velocity]
        if normal is not None:
            graph["normal"] = [float(sympy.N(component)) for component in normal]
    return graph


def analyze_space_curve(request):
    curve = space_curve_from_request(request)
    low, high = curve["interval"]
    report("Finding the velocity…")
    steps, results = velocity_steps(curve)
    report("Finding the curvature…")
    curvature_step, curvature_result = curvature_steps(curve)
    steps.append(curvature_step)
    results.append(curvature_result)
    if curve["at"] is not None:
        point_step_list, point_results = point_steps(curve)
        steps.extend(point_step_list)
        results.extend(point_results)
    report("Finding the arc length…")
    length_step, length_result, length_check, _ = arc_length(curve)
    steps.append(length_step)
    results.append(length_result)
    position = curve["position"]
    return {
        "ok": True,
        "operation": "space",
        "curveLatex": rf"\\mathbf{{r}}(t) = {vector_latex(position)}, \\quad {to_latex(low)} \\le t \\le {to_latex(high)}",
        "results": results,
        "checks": [{"label": "Arc length", "check": length_check}],
        "steps": steps,
        "graph": graph_samples(curve),
    }


def space_trace(request):
    """The lesson picture: for TRACE_STEPS + 1 values of t, the point, T, N,
    the curvature, and the length so far, all computed numerically."""
    curve = space_curve_from_request(request)
    velocity, acceleration = curve["velocity"], curve["acceleration"]
    velocity_at = [numeric_function(component, (T,)) for component in velocity]
    acceleration_at = [numeric_function(component, (T,)) for component in acceleration]
    speed = numeric_function(magnitude(velocity), (T,))
    parameters, (xs, ys, zs) = curve_points(curve, TRACE_STEPS + 1)
    samples = []
    length = 0.0
    for index, t in enumerate(parameters):
        if index > 0:
            length += float(numerical_integral(speed, [parameters[index - 1], t]) or 0)
        v = [numeric_value(function, t) for function in velocity_at]
        a = [numeric_value(function, t) for function in acceleration_at]
        sample = {"t": round(t, 6), "point": [xs[index], ys[index], zs[index]], "length": round(length, 6)}
        sample.update(frame(v, a))
        samples.append(sample)
    _, (cx, cy, cz) = curve_points(curve, GRAPH_POINTS)
    return {"ok": True, "operation": "spaceTrace", "samples": samples, "curve": {"x": cx, "y": cy, "z": cz}}


def frame(v, a):
    """T, N, and κ from the velocity v and acceleration a at one point, as floats;
    None where they aren't defined."""
    empty = {"tangent": None, "normal": None, "curvature": None}
    if None in v or None in a:
        return empty
    speed = sum(c * c for c in v) ** 0.5
    if speed < 1e-12:
        return empty
    tangent = [c / speed for c in v]
    along = sum(ai * ti for ai, ti in zip(a, tangent))
    across = [ai - along * ti for ai, ti in zip(a, tangent)]
    across_length = sum(c * c for c in across) ** 0.5
    # κ = |v × a| / |v|³, and |v × a| = |v| times the part of a across v.
    curvature = across_length / speed**2
    normal = [c / across_length for c in across] if across_length > 1e-12 else None
    return {"tangent": rounded(tangent), "normal": rounded(normal), "curvature": round(curvature, 6)}


def rounded(vector):
    return None if vector is None else [round(component, 6) for component in vector]
`,"./python/mathlab/steps.py":`"""The step format shared by derivative and integral explanations.

A step is a dict with the rule's name, a short explanation (text with inline
LaTeX between $ signs), the math it produces (LaTeX), and the steps it builds on.
"""


def separate(*equations):
    """Several different equations as one math part, each on its own line.
    make_step joins its parts with = signs, which is right for one chain of
    equal things but would make "dx = 1, dz = 2" read as dx = 1 = dz = 2."""
    return r"\\begin{gathered}" + r" \\\\ ".join(equations) + r"\\end{gathered}"


def equation_latex(parts):
    """Join parts with = signs. Chains of several = signs go one per line,
    aligned on the = signs, as in a written derivation."""
    if len(parts) <= 2:
        return " = ".join(parts)
    first, second, *rest = parts
    lines = [f"{first} &= {second}", *(f"&= {part}" for part in rest)]
    return r"\\begin{aligned}" + r" \\\\ ".join(lines) + r"\\end{aligned}"


def make_step(rule, explanation, math_parts, substeps=()):
    return {
        "rule": rule,
        "explanation": explanation,
        "math": equation_latex(math_parts),
        "substeps": [substep for substep in substeps if substep is not None],
    }
`,"./python/mathlab/tangent.py":`"""Tangent planes and linear approximation.

For a graph z = f(x, y), the tangent plane at (a, b) is
z = f(a, b) + f_x(a, b)(x - a) + f_y(a, b)(y - b); as a function, it is the
linearization L(x, y), which approximates f near (a, b). For a level surface
F(x, y, z) = k, the gradient ∇F at a point is perpendicular to the surface,
so the tangent plane is ∇F(P) · ⟨x - a, y - b, z - c⟩ = 0.
"""

from decimal import Decimal

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.directional import gradient_steps, latex_value, number, numerical_rate
from mathlab.expressions import X, Y, Z, InputError, factor_latex, to_latex
from mathlab.multivariable import sample_square, sample_surface
from mathlab.parsing import constants_in
from mathlab.progress import report
from mathlab.steps import make_step, separate
from mathlab.vectors import vector_latex

CHECK_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")
# The lesson picture: a fixed square, and the points the slider can reach.
PICTURE_HALF_WIDTH = 1.5
PICTURE_STEP = sympy.Rational(1, 4)


def terminating_decimal(value):
    """A fraction whose decimal ends, like 41/20 = 2.05, written as that exact
    decimal (as it was typed); None for anything else, like 1/3."""
    if not (isinstance(value, sympy.Rational) and not value.is_Integer):
        return None
    denominator = value.q
    for factor in (2, 5):
        while denominator % factor == 0:
            denominator //= factor
    if denominator != 1:
        return None
    # Exact: the denominator is a product of 2s and 5s, so it divides a power of 10.
    return str(Decimal(value.p) / Decimal(value.q))


def show(value):
    """A value in LaTeX: a terminating decimal as a decimal, otherwise exact with
    a decimal approximation."""
    return terminating_decimal(value) or latex_value(value)


def as_factor(value):
    """show(value), in parentheses when it is negative, for a product."""
    text = show(value)
    return rf"\\left({text}\\right)" if value.could_extract_minus_sign() else text


def point_latex(point):
    return rf"\\left({', '.join(terminating_decimal(value) or to_latex(value) for value in point)}\\right)"


def parse_point(texts, names):
    texts = [text if isinstance(text, str) else "" for text in (texts or [])]
    texts += [""] * (len(names) - len(texts))
    return tuple(number(text, f"point's {name}") for text, name in zip(texts, names))


def only_variables(function, variables, kind):
    constants = constants_in(function, variables)
    if constants:
        names = ", ".join(str(variable) for variable in variables)
        raise InputError(
            f"{kind} must use only {names}, so the answers are numbers. "
            f"Remove {', '.join(str(constant) for constant in constants)}."
        )


def partials_check(function, variables, point, partials):
    """The partial derivatives at the point, compared with numerical differentiation."""
    axes = [sympy.Matrix([1 if i == j else 0 for j in range(len(variables))]) for i in range(len(variables))]
    with mpmath.workdps(CHECK_DIGITS):
        worst = mpmath.mpf(0)
        for axis, exact in zip(axes, partials):
            numeric = numerical_rate(function, variables, point, axis)
            if numeric is None or isinstance(numeric, mpmath.mpc):
                return {"status": "unchecked", "detail": "The slopes couldn't be checked numerically."}
            expected = mpmath.mpf(str(sympy.N(exact, CHECK_DIGITS)))
            worst = max(worst, abs(numeric - expected) / max(1, abs(expected)))
        if worst <= CHECK_TOLERANCE:
            return {
                "status": "verified",
                "detail": "Numerical differentiation at the point gives the same partial derivatives, "
                "so the plane has the surface's slopes there.",
            }
    return {
        "status": "failed",
        "detail": "Numerical differentiation at the point gives different partial derivatives. "
        "Treat this answer with caution.",
    }


def value_check(function, point, exact):
    """f at a point, evaluated straight from the typed expression to 30 digits,
    compared with SymPy's exact value."""
    as_numeric = numeric_function(function, (X, Y))
    with mpmath.workdps(CHECK_DIGITS):
        try:
            numeric = as_numeric(*(mpmath.mpf(str(sympy.N(value, CHECK_DIGITS))) for value in point))
        except Exception:  # Evaluation fails in many ways; all mean "unchecked".
            numeric = None
        if numeric is None or isinstance(numeric, mpmath.mpc):
            return {"status": "unchecked", "detail": "The exact value couldn't be checked numerically."}
        expected = mpmath.mpf(str(sympy.N(exact, CHECK_DIGITS)))
        shown = mpmath.nstr(numeric, 10)
        if abs(numeric - expected) <= CHECK_TOLERANCE * max(1, abs(expected)):
            return {
                "status": "verified",
                "detail": f"Evaluating f directly to 30 digits gives \${shown}$, matching the exact value.",
            }
    return {
        "status": "failed",
        "detail": f"Evaluating f directly gives \${shown}$, which doesn't match. Treat this answer with caution.",
    }


def plane_patch(surface, value, slopes, point):
    """The tangent plane over the middle half of the surface's square, for drawing."""
    xs, ys = surface["x"], surface["y"]
    a, b = (float(sympy.N(coordinate)) for coordinate in point)
    z0 = float(sympy.N(value))
    fx, fy = (float(sympy.N(slope)) for slope in slopes)
    quarter = len(xs) // 4
    px, py = xs[quarter:-quarter], ys[quarter:-quarter]
    return {
        "x": px,
        "y": py,
        "z": [[round(z0 + fx * (x - a) + fy * (y - b), 6) for x in px] for y in py],
    }


def solve_graph(function, point, near=None):
    """The tangent plane to z = f(x, y) at the point, the linearization, and if
    near is given, the approximation there. Returns the steps and the values."""
    a, b = point
    at = point_latex(point)
    value = sympy.simplify(function.subs({X: a, Y: b}))
    if not value.is_finite:
        raise InputError(f"f isn't defined at \${at}$. Choose another point.")
    gradient_step, gradient = gradient_steps(function, (X, Y))
    fx, fy = (sympy.simplify(partial.subs({X: a, Y: b})) for partial in gradient)
    if not (fx.is_finite and fy.is_finite):
        raise InputError(f"A partial derivative of f isn't defined at \${at}$, so there is no tangent plane there.")
    plane = sympy.expand(value + fx * (X - a) + fy * (Y - b))
    steps = [
        gradient_step,
        make_step(
            "Value and slopes at the point",
            rf"Put \${at}$ into $f$, $f_x$, and $f_y$: the height of the surface there and its slopes "
            r"in the $x$ and $y$ directions.",
            [
                rf"f{at} = {to_latex(value)}, \\quad f_x{at} = {to_latex(fx)}, \\quad f_y{at} = {to_latex(fy)}",
            ],
        ),
        make_step(
            "Tangent plane",
            r"The tangent plane passes through the point on the surface and has the same slopes "
            r"there: $z - z_0 = f_x(a, b)(x - a) + f_y(a, b)(y - b)$.",
            # One part: two different equations, joined by an arrow, not by =.
            [
                rf"z - {factor_latex(value)} = {factor_latex(fx)}\\left({to_latex(X - a)}\\right) + "
                rf"{factor_latex(fy)}\\left({to_latex(Y - b)}\\right) \\quad\\Longrightarrow\\quad "
                rf"z = {to_latex(plane)}"
            ],
        ),
        make_step(
            "Linearization",
            r"The tangent plane, read as a function, is the linearization $L(x, y)$. Near the "
            r"point the surface and the plane are close, so $f(x, y) \\approx L(x, y)$ there.",
            [rf"L(x, y) = {to_latex(plane)}"],
        ),
    ]
    solved = {"steps": steps, "value": value, "slopes": (fx, fy), "plane": plane}
    if near is not None:
        x1, y1 = near
        approximate = sympy.simplify(plane.subs({X: x1, Y: y1}))
        actual = sympy.simplify(function.subs({X: x1, Y: y1}))
        if not actual.is_finite:
            raise InputError(f"f isn't defined at \${point_latex(near)}$, so there is nothing to approximate.")
        dx, dy = x1 - a, y1 - b
        differential = sympy.simplify(fx * dx + fy * dy)
        change = sympy.simplify(actual - value)
        steps.append(
            make_step(
                "Linear approximation",
                rf"Use $L$ in place of $f$ at the nearby point \${point_latex(near)}$, and compare "
                r"with the exact value.",
                [
                    separate(
                        rf"f{point_latex(near)} \\approx L{point_latex(near)} = {show(approximate)}",
                        rf"f{point_latex(near)} = {show(actual)}",
                    )
                ],
            )
        )
        steps.append(
            make_step(
                "Differential",
                r"The differential $dz = f_x\\,dx + f_y\\,dy$ estimates the change in $z$ along the "
                r"tangent plane; $\\Delta z$ is the actual change along the surface.",
                [
                    separate(
                        rf"dx = {show(dx)}, \\quad dy = {show(dy)}",
                        rf"dz = {factor_latex(fx)} \\cdot {as_factor(dx)} + {factor_latex(fy)} \\cdot "
                        rf"{as_factor(dy)} = {show(differential)}",
                        rf"\\Delta z = f{point_latex(near)} - f{at} = {show(change)}",
                    )
                ],
            )
        )
        solved.update(approximate=approximate, actual=actual, differential=differential, change=change)
    return solved


def tangent_to_graph(function, point_texts, near_texts):
    if function.has(Z):
        raise InputError(
            "A graph z = f(x, y) uses only x and y. For an equation with z, choose a level surface."
        )
    only_variables(function, (X, Y), "f")
    point = parse_point(point_texts, ("x", "y"))
    near = None
    if near_texts and any(isinstance(text, str) and text.strip() for text in near_texts):
        near = parse_point(near_texts, ("x", "y"))
    report("Finding the tangent plane…")
    solved = solve_graph(function, point, near)
    at = point_latex(point)
    results = [
        {"label": "Tangent plane", "latex": rf"z = {to_latex(solved['plane'])}"},
        {"label": "Linearization", "latex": rf"L(x, y) = {to_latex(solved['plane'])}"},
    ]
    checks = [{"label": "Tangent plane", "check": partials_check(function, (X, Y), point, solved["slopes"])}]
    if near is not None:
        there = point_latex(near)
        results += [
            {"label": "Approximation", "latex": rf"f{there} \\approx L{there} = {show(solved['approximate'])}"},
            {"label": "Exact value", "latex": rf"f{there} = {show(solved['actual'])}"},
            {
                "label": "dz and Δz",
                "latex": rf"dz = {show(solved['differential'])}, \\quad \\Delta z = {show(solved['change'])}",
            },
        ]
        checks.append({"label": "Exact value", "check": value_check(function, near, solved["actual"])})
    surface = sample_surface(function, point)
    return {
        "ok": True,
        "operation": "tangent",
        "kind": "graph",
        "functionLatex": rf"z = f(x, y) = {to_latex(function)}, \\text{{ at }} {at}",
        "results": results,
        "checks": checks,
        "steps": solved["steps"],
        "graph": {"surface": surface, "plane": plane_patch(surface, solved["value"], solved["slopes"], point)},
    }


def standard_plane(expression):
    """a x + b y + c z + d = 0 with whole-number coefficients and no common
    factor, the first one positive, when the coefficients are rational."""
    numerator, _ = sympy.fraction(sympy.together(sympy.expand(expression)))
    numerator = sympy.expand(numerator)
    try:
        polynomial = sympy.Poly(numerator, X, Y, Z)
    except sympy.PolynomialError:
        return numerator
    if all(coefficient.is_Rational for coefficient in polynomial.coeffs()):
        _, polynomial = polynomial.primitive()
        numerator = polynomial.as_expr()
    leading = next((numerator.coeff(variable) for variable in (X, Y, Z) if numerator.coeff(variable) != 0), 1)
    return sympy.expand(-numerator) if leading.could_extract_minus_sign() else numerator


def tangent_to_level_surface(function, point_texts):
    only_variables(function, (X, Y, Z), "F")
    point = parse_point(point_texts, ("x", "y", "z"))
    a, b, c = point
    at = point_latex(point)
    substitutions = {X: a, Y: b, Z: c}
    level = sympy.simplify(function.subs(substitutions))
    if not level.is_finite:
        raise InputError(f"F isn't defined at \${at}$. Choose another point.")
    report("Finding the gradient…")
    gradient_step, gradient = gradient_steps(function, (X, Y, Z))
    normal = gradient.subs(substitutions).applyfunc(sympy.simplify)
    if not all(component.is_finite for component in normal):
        raise InputError(f"A partial derivative of F isn't defined at \${at}$, so there is no tangent plane there.")
    if all(component == 0 for component in normal):
        raise InputError(
            f"$\\\\nabla F{at} = \\\\mathbf{{0}}$, so it gives no normal direction, and the surface "
            "may not have a tangent plane there."
        )
    offset = sympy.Matrix([X - a, Y - b, Z - c])
    plane = standard_plane(normal.dot(offset))
    t = sympy.Symbol("t", real=True)
    line = [sympy.expand(coordinate + component * t) for coordinate, component in zip(point, normal)]
    steps = [
        make_step(
            "The level surface through the point",
            rf"$F{at} = {to_latex(level)}$, so the point lies on the level surface "
            rf"$F(x, y, z) = {to_latex(level)}$.",
            [rf"{to_latex(function)} = {to_latex(level)}"],
        ),
        gradient_step,
        make_step(
            "Normal vector",
            r"The gradient is perpendicular to the level surface through the point, so "
            rf"$\\nabla F{at}$ is a normal vector for the tangent plane.",
            [rf"\\nabla F{at} = {vector_latex(normal)}"],
        ),
        make_step(
            "Tangent plane to a level surface",
            r"The tangent plane is every point $(x, y, z)$ whose offset from the point is "
            r"perpendicular to the normal: $\\nabla F \\cdot \\langle x - a, y - b, z - c \\rangle = 0$. "
            r"Expand it and clear fractions.",
            [
                rf"{vector_latex(normal)} \\cdot {vector_latex(offset)} = 0 \\quad\\Longrightarrow\\quad "
                rf"{to_latex(plane)} = 0"
            ],
        ),
        make_step(
            "Normal line",
            r"The normal line goes through the point in the direction of $\\nabla F$.",
            [rf"x = {to_latex(line[0])}, \\quad y = {to_latex(line[1])}, \\quad z = {to_latex(line[2])}"],
        ),
    ]
    return {
        "ok": True,
        "operation": "tangent",
        "kind": "level",
        "functionLatex": rf"F(x, y, z) = {to_latex(function)} = {to_latex(level)}, \\text{{ at }} {at}",
        "results": [
            {"label": "Tangent plane", "latex": rf"{to_latex(plane)} = 0"},
            {"label": "Normal vector", "latex": rf"\\nabla F{at} = {vector_latex(normal)}"},
            {
                "label": "Normal line",
                "latex": rf"x = {to_latex(line[0])}, \\quad y = {to_latex(line[1])}, \\quad z = {to_latex(line[2])}",
            },
        ],
        "checks": [{"label": "Normal vector", "check": partials_check(function, (X, Y, Z), point, list(normal))}],
        "steps": steps,
        # An implicit surface isn't drawn.
        "graph": None,
    }


def tangent_plane(function, kind, point_texts, near_texts=None):
    if kind == "level":
        return tangent_to_level_surface(function, point_texts)
    if kind == "graph":
        return tangent_to_graph(function, point_texts, near_texts)
    raise InputError("Choose a graph z = f(x, y) or a level surface F(x, y, z) = k.")


def tangent_picture(function):
    """The lesson picture: the surface over a fixed square around the origin,
    and f, f_x, f_y at every point the sliders can reach."""
    only_variables(function, (X, Y), "f")
    partials = [sympy.diff(function, variable) for variable in (X, Y)]
    as_numeric = [numeric_function(expression, (X, Y)) for expression in (function, *partials)]
    xs, ys, z = sample_square(as_numeric[0], (0, 0), PICTURE_HALF_WIDTH)
    steps = int(2 * PICTURE_HALF_WIDTH / PICTURE_STEP)
    values = [float(-PICTURE_HALF_WIDTH + index * PICTURE_STEP) for index in range(steps + 1)]
    points = []
    for b in values:
        row = []
        for a in values:
            with mpmath.workdps(15):
                try:
                    numbers = [float(f(mpmath.mpf(a), mpmath.mpf(b))) for f in as_numeric]
                except Exception:  # Undefined points raise many error types; all mean "no value".
                    numbers = None
            row.append(None if numbers is None else [round(number, 6) for number in numbers])
        points.append(row)
    return {
        "ok": True,
        "operation": "tangentPicture",
        "surface": {"x": xs, "y": ys, "z": z, "point": [0, 0, None]},
        "values": values,
        # points[j][i] is [f, f_x, f_y] at (values[i], values[j]), or null.
        "points": points,
    }
`,"./python/mathlab/triple.py":`"""Triple integrals, as iterated integrals (Fubini's theorem in three dimensions).

The innermost integral is taken first, with the two other variables held
constant, and its bounds may depend on both of them. The middle integral's
bounds may depend on the outermost variable, and the outermost bounds are
numbers. Together the bounds describe a solid region E. The value is checked
with a numerical triple integration.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function
from mathlab.definite import INFINITY, evaluate_between, parse_bound
from mathlab.double import antiderivative_step
from mathlab.expressions import PHI, RHO, THETA, R, X, Y, Z, InputError, factor_latex, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number, simplify_on_region
from mathlab.steps import make_step

# The order of integration: (innermost, middle, outermost) variables.
ORDERS = {
    "dz dy dx": (Z, Y, X),
    "dz dx dy": (Z, X, Y),
    "dy dz dx": (Y, Z, X),
    "dy dx dz": (Y, X, Z),
    "dx dz dy": (X, Z, Y),
    "dx dy dz": (X, Y, Z),
}
LEVELS = ("innermost", "middle", "outermost")
CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
# The fast numerical method is trusted when it estimates its own error below this.
FAST_METHOD_TOLERANCE = mpmath.mpf("1e-12")


# How the variables read in messages: θ, not theta.
SPELLINGS = {"theta": "θ", "phi": "φ", "rho": "ρ"}


def spelled(variable):
    return SPELLINGS.get(str(variable), str(variable))


def names(variables):
    return " and ".join(spelled(variable) for variable in variables)


def parse_dependent_bound(text, name, level, variable, allowed):
    """A bound that is a number or an expression in the allowed outer variables."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound of the {level} integral.")
    if INFINITY.search(text):
        raise InputError("Infinite bounds in a triple integral aren't supported yet.")
    try:
        bound = parse_function(latex_to_text(text), allowed)
    except InputError as error:
        raise InputError(f"The {level} integral's {name} bound: {error}") from error
    used = {str(symbol) for symbol in bound.free_symbols}
    if str(variable) in used:
        raise InputError(
            f"The {level} integral's bounds can depend on {names(allowed)} but not on "
            f"{spelled(variable)}, the variable it integrates."
        )
    if used - {str(symbol) for symbol in allowed}:
        raise InputError(
            f"The {level} integral's {name} bound can use only numbers and {names(allowed)}."
        )
    return bound


def parse_outermost_bound(text, name):
    bound = parse_bound(text, f"outermost integral's {name}")
    if bound.is_infinite:
        raise InputError("Infinite bounds in a triple integral aren't supported yet.")
    return bound


def parse_bounds(variables, texts):
    """The bounds of each integral, innermost first, as (lower, upper) pairs."""
    _, middle, outer = variables
    allowed = {"innermost": (middle, outer), "middle": (outer,)}
    bounds = []
    for level, variable, pair in zip(LEVELS[:2], variables, texts):
        bounds.append(
            tuple(
                parse_dependent_bound(text, name, level, variable, allowed[level])
                for text, name in zip(pair, ("lower", "upper"))
            )
        )
    outer_bounds = tuple(
        parse_outermost_bound(text, name) for text, name in zip(texts[2], ("lower", "upper"))
    )
    if (outer_bounds[1] - outer_bounds[0]).is_negative:
        raise InputError("The outermost integral's lower bound must be at most its upper bound.")
    bounds.append(outer_bounds)
    return bounds


def integrate_level(function, variable, low, high, rule, explanation, region=None):
    """One integral of the three: its step and its value. region holds the outer
    variables and their bounds, where the value is used and can be simplified."""
    antiderivative, _, steps, _ = find_antiderivative(function, variable)
    math, value = evaluate_between(function, antiderivative, low, high, variable)
    if region is not None:
        simpler = simplify_on_region(value, *region)
        if simpler != value:
            math.append(to_latex(simpler))
            value = simpler
    if value.has(sympy.nan, sympy.zoo, sympy.oo, -sympy.oo):
        raise InputError(
            "One of the integrals has no finite value everywhere on the region, so this triple "
            "integral is improper, which the Solver can't do yet."
        )
    step = make_step(
        rule, explanation, math, [antiderivative_step(function, variable, antiderivative, steps)]
    )
    return step, value


def nested_quad(as_numeric, interval_functions, outer_interval, method):
    """The triple integral computed numerically, and the largest error estimate of
    any of its one-variable integrals."""
    inner_interval, middle_interval = interval_functions
    largest_error = [mpmath.mpf(0)]

    def quad(integrand, interval):
        result, error = mpmath.quad(integrand, interval, method=method, error=True)
        largest_error[0] = max(largest_error[0], abs(error))
        return result

    total = quad(
        lambda o: quad(
            lambda m: quad(lambda i: real_number(as_numeric(i, m, o)), inner_interval(m, o)),
            middle_interval(o),
        ),
        outer_interval,
    )
    return total, largest_error[0]


def numerical_check(function, variables, bounds, value):
    inner, middle, outer = variables
    as_numeric = numeric_function(function, (inner, middle, outer))
    inner_low, inner_high = (numeric_function(bound, (middle, outer)) for bound in bounds[0])
    middle_low, middle_high = (numeric_function(bound, (outer,)) for bound in bounds[1])
    interval_functions = (
        lambda m, o: [real_number(inner_low(m, o)), real_number(inner_high(m, o))],
        lambda o: [real_number(middle_low(o)), real_number(middle_high(o))],
    )
    with mpmath.workdps(CHECK_DIGITS):
        outer_interval = [mpmath.mpf(str(sympy.N(bound, CHECK_DIGITS))) for bound in bounds[2]]
        try:
            exact = mpmath.mpmathify(sympy.N(value, CHECK_DIGITS))
            # Gauss-Legendre is very fast on smooth functions; when it isn't sure
            # of its answer (as at a sphere's edge), tanh-sinh is slower but
            # handles such edges well.
            numeric, error = nested_quad(as_numeric, interval_functions, outer_interval, "gauss-legendre")
            if error > FAST_METHOD_TOLERANCE * max(1, abs(numeric)):
                numeric, _ = nested_quad(as_numeric, interval_functions, outer_interval, "tanh-sinh")
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if numeric is None or isinstance(numeric, mpmath.mpc) or isinstance(exact, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
            return {
                "status": "verified",
                "detail": f"A numerical triple integration gives \${shown}$, matching the exact "
                "answer.",
            }
        return {
            "status": "failed",
            "detail": f"A numerical triple integration gives \${shown}$, which doesn't match. "
            "Treat this answer with caution.",
        }


def iterated_triple_integral(function, variables, bounds):
    """The iterated integral's LaTeX, its steps, and its values: the innermost
    integral (a function of the middle and outermost variables), the middle
    integral (a function of the outermost variable), and the exact value."""
    inner, middle, outer = variables
    latex = [to_latex(variable) for variable in variables]
    iterated = to_latex(
        sympy.Integral(function, *((variable, *pair) for variable, pair in zip(variables, bounds)))
    )

    def interval(pair):
        return rf"from \${to_latex(pair[0])}$ to \${to_latex(pair[1])}$"

    steps = [
        make_step(
            "Iterated triple integral",
            rf"Write the triple integral over the solid $E$ as an iterated integral: integrate "
            rf"with respect to \${latex[0]}$ first, {interval(bounds[0])}; then \${latex[1]}$ "
            rf"{interval(bounds[1])}; then \${latex[2]}$ {interval(bounds[2])}.",
            [rf"\\iiint_{{E}} {to_latex(function)}\\, dV", iterated],
        )
    ]
    report("Integrating the innermost integral…")
    step, inner_value = integrate_level(
        function,
        inner,
        *bounds[0],
        "Innermost integral",
        rf"Integrate with respect to \${latex[0]}$, treating \${latex[1]}$ and \${latex[2]}$ as "
        r"constants, then subtract the antiderivative's values at the bounds.",
        region=((middle, outer), bounds[1:]),
    )
    steps.append(step)
    report("Integrating the middle integral…")
    step, middle_value = integrate_level(
        inner_value,
        middle,
        *bounds[1],
        "Middle integral",
        rf"Integrate the result with respect to \${latex[1]}$, treating \${latex[2]}$ as a "
        r"constant, and evaluate between its bounds.",
        region=((outer,), bounds[2:]),
    )
    steps.append(step)
    report("Integrating the outermost integral…")
    step, value = integrate_level(
        middle_value,
        outer,
        *bounds[2],
        "Outermost integral",
        rf"Integrate the result with respect to \${latex[2]}$ and evaluate between its bounds.",
    )
    steps.append(step)
    return iterated, steps, (inner_value, middle_value, value)


# Cylindrical and spherical coordinates: the variables in the usual order
# (innermost first), x, y, and z in terms of them, and the volume factor:
# dV = r dz dr dθ, or ρ² sin φ dρ dφ dθ.
COORDINATE_SYSTEMS = {
    "cylindrical": {
        "name": "cylindrical",
        "variables": (Z, R, THETA),
        "xyz": (R * sympy.cos(THETA), R * sympy.sin(THETA), Z),
        "factor": R,
        "substitution": r"x = r\\cos\\theta, \\quad y = r\\sin\\theta, \\quad z = z",
        "volume": r"dV = r\\, dz\\, dr\\, d\\theta",
        "why": r"A small box in cylindrical coordinates has sides $dr$, $r\\,d\\theta$ (an arc of a "
        r"circle of radius $r$), and $dz$, so its volume is $r\\,dz\\,dr\\,d\\theta$.",
    },
    "spherical": {
        "name": "spherical",
        "variables": (RHO, PHI, THETA),
        "xyz": (
            RHO * sympy.sin(PHI) * sympy.cos(THETA),
            RHO * sympy.sin(PHI) * sympy.sin(THETA),
            RHO * sympy.cos(PHI),
        ),
        "factor": RHO**2 * sympy.sin(PHI),
        "substitution": r"x = \\rho\\sin\\phi\\cos\\theta, \\quad y = \\rho\\sin\\phi\\sin\\theta, \\quad z = \\rho\\cos\\phi",
        "volume": r"dV = \\rho^2 \\sin\\phi\\, d\\rho\\, d\\phi\\, d\\theta",
        "why": r"A small box in spherical coordinates has sides $d\\rho$, $\\rho\\,d\\phi$ (an arc of "
        r"a circle of radius $\\rho$), and $\\rho\\sin\\phi\\,d\\theta$ (an arc of a circle of radius "
        r"$\\rho\\sin\\phi$, the distance to the $z$-axis), so its volume is "
        r"$\\rho^2\\sin\\phi\\,d\\rho\\,d\\phi\\,d\\theta$.",
    },
}


def change_coordinates(function, system):
    """f(x, y, z) in the new coordinates, times the volume factor: the step and
    the new integrand."""
    x, y, z = system["xyz"]
    substituted = sympy.simplify(function.subs({X: x, Y: y, Z: z}, simultaneous=True))
    integrand = sympy.simplify(substituted * system["factor"])
    differentials = r"\\,".join(rf"d{to_latex(variable)}" for variable in system["variables"])
    rewritten = (
        ""
        if substituted == function
        else rf" Here $f = {to_latex(function)}$ becomes \${to_latex(substituted)}$."
    )
    step = make_step(
        f"Change to {system['name']} coordinates",
        rf"Write $x$, $y$, and $z$ in {system['name']} coordinates, \${system['substitution']}$, "
        rf"and replace $dV$ by \${system['volume']}$. {system['why']}{rewritten}",
        [
            r"f\\, dV",
            rf"{factor_latex(substituted)} \\cdot {factor_latex(system['factor'])}\\, {differentials}",
            rf"{to_latex(integrand)}\\, {differentials}",
        ],
    )
    return step, integrand


def triple_integral(function, order, bound_texts, coordinates="rectangular"):
    """bound_texts holds (lower, upper) LaTeX pairs, innermost integral first.
    In cylindrical or spherical coordinates the order is the usual one,
    dz dr dθ or dρ dφ dθ, and the bounds are in those coordinates."""
    system = COORDINATE_SYSTEMS.get(coordinates)
    if system is None and coordinates not in (None, "rectangular"):
        raise InputError("Choose rectangular, cylindrical, or spherical coordinates.")
    if system is None and order not in ORDERS:
        raise InputError("Choose the order of integration, such as dz dy dx.")
    variables = system["variables"] if system else ORDERS[order]
    constants = constants_in(function, (X, Y, Z))
    if constants:
        raise InputError(
            f"A triple integral needs a function of x, y, and z alone, so its answer is a "
            f"number. Remove {', '.join(str(constant) for constant in constants)}."
        )
    bounds = parse_bounds(variables, bound_texts)
    first_steps = []
    if system:
        step, function = change_coordinates(function, system)
        first_steps.append(step)
    iterated, steps, (_, _, value) = iterated_triple_integral(function, variables, bounds)
    steps = [*first_steps, *steps]
    equation = f"{iterated} = {to_latex(value)}"
    if not value.is_Rational:
        equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(value, 15))), 6)}"
    report("Checking the answer numerically…")
    return {
        "ok": True,
        "operation": "triple",
        "equationLatex": equation,
        "check": numerical_check(function, variables, bounds, value),
        "steps": steps,
        "stepsNote": None,
    }
`,"./python/mathlab/vectors.py":`"""Vectors in 3D: length, dot product, angle, and projection, with steps."""

import math

import sympy

from mathlab.expressions import InputError, factor_latex, to_latex
from mathlab.parsing import parse_function
from mathlab.steps import make_step


def parse_vector(components, name):
    """Three components, each a number like 2, -1/2, or sqrt(3), as exact values."""
    if not isinstance(components, list) or len(components) != 3:
        raise InputError(f"Enter three components for {name}.")
    values = []
    for text in components:
        if not isinstance(text, str) or not text.strip():
            raise InputError(f"Fill in every component of {name}.")
        value = parse_function(text, variables=())
        if value.free_symbols:
            raise InputError(f"The components of {name} must be numbers, like 2, -1/2, or sqrt(3).")
        values.append(value)
    return sympy.Matrix(values)


def vector_latex(vector):
    return rf"\\langle {', '.join(to_latex(component) for component in vector)} \\rangle"


def length(vector):
    return sympy.sqrt(sympy.expand(vector.dot(vector)))


def degrees(angle):
    return f"{math.degrees(float(angle)):.4g}"


def length_step(vector, name):
    squares = " + ".join(f"{factor_latex(component)}^{{2}}" for component in vector)
    return make_step(
        f"Length of {name}",
        rf"The length is the square root of the sum of the squared components: "
        rf"$|\\mathbf{{v}}| = \\sqrt{{v_1^2 + v_2^2 + v_3^2}}$.",
        [rf"|\\mathbf{{{name}}}|", rf"\\sqrt{{{squares}}}", to_latex(length(vector))],
    )


def dot_product_step(a, b):
    products = " + ".join(f"{factor_latex(x)} {factor_latex(y)}" for x, y in zip(a, b))
    return make_step(
        "Dot product",
        r"Multiply matching components and add: "
        r"$\\mathbf{a} \\cdot \\mathbf{b} = a_1 b_1 + a_2 b_2 + a_3 b_3$.",
        [r"\\mathbf{a} \\cdot \\mathbf{b}", products, to_latex(sympy.simplify(a.dot(b)))],
    )


def angle_result(a, b, dot):
    """The angle between a and b, or a note when it is undefined."""
    if length(a) == 0 or length(b) == 0:
        return None, make_step(
            "Angle",
            "A zero vector has no direction, so the angle between the vectors is undefined.",
            [],
        )
    cosine = sympy.radsimp(sympy.simplify(dot / (length(a) * length(b))))
    angle = sympy.acos(cosine)
    if dot == 0:
        note = r" Because $\\mathbf{a} \\cdot \\mathbf{b} = 0$, the vectors are perpendicular."
    elif abs(cosine) == 1:
        note = " Because the cosine is ±1, the vectors are parallel."
    else:
        note = ""
    step = make_step(
        "Angle between the vectors",
        r"From $\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}| |\\mathbf{b}| \\cos\\theta$, "
        rf"$\\cos\\theta = \\frac{{\\mathbf{{a}} \\cdot \\mathbf{{b}}}}{{|\\mathbf{{a}}| |\\mathbf{{b}}|}}$.{note}",
        [
            r"\\cos\\theta",
            rf"\\frac{{{to_latex(dot)}}}{{{factor_latex(length(a))} \\cdot {factor_latex(length(b))}}}",
            to_latex(cosine),
        ],
        [
            make_step(
                "Solve for the angle",
                r"Take the inverse cosine; $\\theta$ is between $0$ and $\\pi$.",
                [r"\\theta", to_latex(angle), rf"{degrees(angle)}^\\circ"],
            )
        ],
    )
    return angle, step


def projection_results(a, b, dot):
    """The scalar and vector projections of a onto b, or None if b is zero."""
    length_b = length(b)
    if length_b == 0:
        return None
    scalar = sympy.radsimp(dot / length_b)
    vector = (dot / length_b**2) * b
    step = make_step(
        "Projection of a onto b",
        r"The part of $\\mathbf{a}$ that points along $\\mathbf{b}$. The scalar projection is "
        r"$\\operatorname{comp}_{\\mathbf{b}} \\mathbf{a} = \\frac{\\mathbf{a} \\cdot \\mathbf{b}}{|\\mathbf{b}|}$, "
        r"and the vector projection is "
        r"$\\operatorname{proj}_{\\mathbf{b}} \\mathbf{a} = \\frac{\\mathbf{a} \\cdot \\mathbf{b}}{|\\mathbf{b}|^2} \\mathbf{b}$.",
        [
            r"\\operatorname{proj}_{\\mathbf{b}} \\mathbf{a}",
            rf"\\frac{{{to_latex(dot)}}}{{{factor_latex(length_b)}^{{2}}}} {vector_latex(b)}",
            vector_latex(vector),
        ],
    )
    return scalar, vector, step


def analyze_vectors(a, b):
    dot = sympy.simplify(a.dot(b))
    angle, angle_step = angle_result(a, b, dot)
    projection = projection_results(a, b, dot)
    results = [
        {"label": "Length of a", "latex": rf"|\\mathbf{{a}}| = {to_latex(length(a))}"},
        {"label": "Length of b", "latex": rf"|\\mathbf{{b}}| = {to_latex(length(b))}"},
        {"label": "Dot product", "latex": rf"\\mathbf{{a}} \\cdot \\mathbf{{b}} = {to_latex(dot)}"},
    ]
    if angle is not None:
        results.append(
            {"label": "Angle", "latex": rf"\\theta = {to_latex(angle)} \\approx {degrees(angle)}^\\circ"}
        )
    steps = [length_step(a, "a"), length_step(b, "b"), dot_product_step(a, b), angle_step]
    projection_vector = None
    if projection is not None:
        scalar, projection_vector, projection_step = projection
        results.append(
            {
                "label": "Scalar projection",
                "latex": rf"\\operatorname{{comp}}_{{\\mathbf{{b}}}} \\mathbf{{a}} = {to_latex(scalar)}",
            }
        )
        results.append(
            {
                "label": "Vector projection",
                "latex": rf"\\operatorname{{proj}}_{{\\mathbf{{b}}}} \\mathbf{{a}} = {vector_latex(projection_vector)}",
            }
        )
        steps.append(projection_step)
    return {
        "ok": True,
        "operation": "vectors",
        "aLatex": rf"\\mathbf{{a}} = {vector_latex(a)}",
        "bLatex": rf"\\mathbf{{b}} = {vector_latex(b)}",
        "results": results,
        "steps": steps,
        "arrows": {
            "a": [float(component) for component in a],
            "b": [float(component) for component in b],
            "projection": None if projection_vector is None else [float(c) for c in projection_vector],
        },
    }
`}),t=`/home/pyodide/python`;function n(n){for(let[r,i]of Object.entries(e)){let e=`${t}/${r.replace(`./python/`,``)}`;n.FS.mkdirTree(e.slice(0,e.lastIndexOf(`/`))),n.FS.writeFile(e,i)}return n.pyimport(`sys`).path.insert(0,t),n.pyimport(`mathlab.calculus`).run_request}const r=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`;function i(e){self.postMessage(e)}async function a(){i({type:`progress`,message:`Downloading Python…`});let{loadPyodide:e}=await import(
/* @vite-ignore */
`${r}pyodide.mjs`),t=await e({indexURL:r});return i({type:`progress`,message:`Loading SymPy…`}),await t.loadPackage(`sympy`),n(t)}const o=a();o.then(()=>i({type:`ready`}),e=>i({type:`loadFailed`,error:String(e)})),self.onmessage=async e=>{let{id:t,...n}=e.data,r;try{let e=await o,a=e=>i({type:`solveProgress`,id:t,message:e});r=JSON.parse(e(JSON.stringify({...n,format:`latex`}),a))}catch(e){r={ok:!1,error:`The math engine failed: ${String(e)}`}}i({type:`response`,id:t,response:r})};